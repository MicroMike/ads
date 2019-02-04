// LICENSE_CODE ZON
'use strict'; /*jslint browser:true, es6:true*/
define(['jquery', 'underscore', 'backbone', '/bext/pub/backbone.js',
    '/util/etask.js', '/bext/pub/util.js', '/bext/pub/tabs.js',
    '/bext/pub/ext.js', '/protocol/pub/pac_engine.js',
    '/bext/pub/browser.js', '/svc/pub/util.js', '/util/version_util.js',
    '/util/escape.js', '/bext/pub/lib.js', '/util/url.js', '/util/date.js',
    '/util/zerr.js', '/util/browser.js', '/bext/vpn/pub/util.js',
    '/bext/vpn/pub/defines.js', '/bext/vpn/pub/agent.js', '/util/util.js',
    '/bext/vpn/pub/pac.js', '/util/array.js', '/util/attrib.js',
    '/util/string.js', '/svc/pub/unblocker_lib.js',
    '/bext/vpn/pub/hybrid_mock.js', '/bext/vpn/pub/features.js',
    '/bext/vpn/pub/premium.js', '/util/storage.js', '/util/ajax.js'],
    function($, _, Backbone, be_backbone, etask, be_util, be_tabs, be_ext,
    pac_engine, B, svc_util, version_util, zescape, be_lib, zurl,
    date, zerr, browser, be_vpn_util, be_defines, be_agent, zutil,
    be_pac, array, attrib, string, unblocker_lib, hybrid_mock, be_features,
    premium, storage, ajax){
B.assert_bg('be_tab_unblocker');
var assign = Object.assign, chrome = window.chrome;
var bw_perr_conf = [], proxy_debug, proxy_debug_timing, requests_handler;
var E = new (be_backbone.model.extend({tab_unblockers: {}, requests: {},
    agent_requests: {}, internal_reqs: {}, hosts_cache: {}, routing_reqs: {},
    routing_trace: {},
    _defaults: function(){ this.on('destroy', function(){ E.uninit(); }); },
}))();
var cb_wrapper = zerr.catch_unhandled_exception;
var HOUR = date.ms.HOUR, bext_config = {};
var new_firefox = be_util.browser_guess.browser=='firefox' &&
    +be_util.browser_guess.version>=54;

var force_agent = storage.get_json('be_force_agent');
var DEBUG_REQS = [{url: /netflix|nflx/i, status: 420, info: function(d){
    var hdrs, session, ip;
    if (!(hdrs = d&&d.responseHeaders))
        return '';
    var print = ['x-netflix-geo-check', 'x-session-info', 'x-tcp-info'];
    var get_hdr = function(n){
        n = n.toLowerCase();
        return (hdrs.find(function(h){ return h.name.toLowerCase()==n; })||{})
        .value;
    };
    var ret = print.map(function(p){ return p+':'+get_hdr(p); }).join(';');
    if ((session = get_hdr('x-session-info')) &&
        (ip = session.match(/^addr=([\d.]+);/)) && ip[1])
    {
        ret = 'ip:'+ip[1]+';'+ret;
    }
    return ret;
}, vpn_dns: 1}];

function is_cors(req){
    if (req.type!='xmlhttprequest')
        return false;
    var main_url = be_tabs.get_url(req.tabId);
    if (!main_url)
        return true;
    return zurl.get_host(main_url)!=zurl.get_host(req.url);
}

var ff_exported = []; // exported so they can be called by ff privileged code
function ff_cb_wrapper(name){
    var args = array.slice(arguments, 1);
    var wrapped = zerr.catch_unhandled_exception.apply(zerr, args);
    ff_exported.push({fn: wrapped, name: name});
    return wrapped;
}

function is_main_frame(details){
    return !details.frameId && details.type=='main_frame'; }

var hola_req_id = 0;
function make_internal_request(url, hdrs, opt){
    var req_url;
    // XXX alexeym/shachar: find a way to make .redirectUrl work in FF
    req_url = 'http://internal.hola/'+(++hola_req_id);
    E.internal_reqs[req_url] = {url: url, hdrs: hdrs, opt: opt};
    return req_url;
}
function hola_XMLHttpRequest(url, method, hdrs, opt){
    var xhr = new XMLHttpRequest();
    var req_url = make_internal_request(url, hdrs, opt);
    xhr.hola_url = req_url;
    xhr.open(method, req_url);
    return xhr;
}

function hdrs_arr_to_obj(hdrs){
    var _hdrs = {};
    for (var i=0; i<hdrs.length; i++)
        _hdrs[hdrs[i].name] = hdrs[i].value;
    return _hdrs;
}

function routing_reqs_set_timer(url){
    E.routing_reqs[url].to = setTimeout(function(){
        delete E.routing_reqs[url]; }, 10000);
}

function routing_reqs_set(details, req){
    if (!E.routing_reqs[req.url])
    {
        trace_req(details, 'set routing req');
        E.routing_reqs[req.url] = {req: req};
    }
    routing_reqs_set_timer(req.url);
}

function send_direct_ajax(req){
    if (req.direct_req)
        return;
    req.hdrs = hdrs_arr_to_obj(req.hdrs);
    req.hdrs['Cache-Control'] = 'no-cache';
    try {
        var xhr = req.direct_req = hola_XMLHttpRequest(req.url, req.method,
            req.hdrs, {force: 'direct', ignore_redir: true, no_routing: true});
        trace_req(req, 'sending direct');
        xhr.onreadystatechange = cb_wrapper(function(){
            var cmd;
            if (xhr.readyState===xhr.DONE)
            {
                trace_req(req, 'direct done');
                var ir = E.internal_reqs[req.url]||{};
                if (!req.direct_resp && ir.res)
                    req.direct_resp = {code: ir.res.code, error: ir.res.error};
                cmd = req.strategy(req.direct_resp, req.proxy_resp);
                trace_req(req, cmd.log);
                delete E.internal_reqs[req.url];
                delete E.internal_reqs[xhr.hola_url];
            }
            if (xhr.readyState!=xhr.HEADERS_RECEIVED)
                return;
            trace_req(req, 'direct headers received');
            req.direct_resp = {
                code: xhr.status,
                len: xhr.getResponseHeader('Content-Length'),
                te: xhr.getResponseHeader('Transfer-Encoding'),
                lmod: xhr.getResponseHeader('Last-Modified'),
                etag: xhr.getResponseHeader('Etag'),
                type: xhr.getResponseHeader('Content-Type'),
            };
            function direct_req_abort(){
                if (req.direct_req.abort)
                    return req.direct_req.abort();
                // XXX pavlo: debug case when req.direct_req is boolean
                var trace = proxy_debug && E.routing_trace[req.id];
                if (!trace)
                    return;
                trace = trace.trace;
                be_lib.perr_err({id: 'new_unblocker_api_direct_req_no_abort',
                    info: {url: req.url, rule: zutil.get(req, 'opt.rule.id'),
                    method: req.method,
                    strategy: zutil.get(req, 'strategy.desc'),
                    trace: build_trace_string(req.id, trace)},
                    bt: (new Error()).stack});
            }
            if (req.direct_timeout)
                clearTimeout(req.direct_timeout);
            cmd = req.strategy(req.direct_resp, req.proxy_resp);
            trace_req(req, cmd.log);
            if (cmd.proxy.serve && !cmd.direct.serve)
            {
                trace_req(req, 'aborting direct');
                direct_req_abort();
                return;
            }
            /* abort request if no chance of using this response as cache */
            var cc = xhr.getResponseHeader('Cache-Control');
            if (cc && (/no-store/.test(cc)
                || /(no-cache|must-revalidate|max-age)/.test(cc)
                && !req.direct_resp.lmod && !req.direct_resp.etag))
            {
                trace_req(req, 'aborting direct');
                direct_req_abort();
            }
        });
        xhr.send();
    } catch(e){}
}

// we redirect requests because FindProxyForURL is called before
// onBeforeRequest so we mark the request for proxying and rerun it.
// since firefox 54 it is not allowed to redirect cors requests due to
// "security reasons"
// https://bugzilla.mozilla.org/show_bug.cgi?id=1283160#c6
// there is still a bug here, race condition when there are a lot of requests
// to the same domain, which leads to some requests are going directly:
// req 1 (example.com/1), FindProxyForUrl (direct)
// req 1, set_proxy_for_url
// req 1, restarting
// req 2 (example.com/2), FindProxyForUrl (proxy, was set by req 1)
// req 2, set_proxy_for_url
// req 2, restarting
// req 1, FindProxyForUrl (proxy, was set by req 2)
// req 2, FindProxyForUrl (direct) <- bug!
// we can fix all these issues via https://bugzilla.mozilla.org/show_bug.cgi?id=1409878
function firefox_redirect(req, details, proxy_str){
    if (!hybrid_mock.initialized || req.redirected)
        return;
    if (new_firefox && !req.opt.int_req && is_cors(details))
        return void trace_req(details, 'cannot restart cors');
    trace_req(details, 'restarting');
    E.requests[details.requestId] = req;
    req.redirect_route_str = proxy_str;
    req.redirected = true;
    details.ret.redirectUrl = details.url;
}

function nodify_res(details){
    var ret, n = details.statusLine.match(/^HTTP\/(\d\.\d) (\d{3})( (.*))?$/);
    if (!n)
    {
        be_lib.perr_err({id: 'bad_status_line', rate_limit: {count: 2},
            info: {statusLine: details.statusLine, url: details.url,
                method: details.method, statusCode: details.statusCode}});
        // XXX bahaa HACK: untill we find the reason for bad status line
        n = [null, '1.1', details.statusCode, ' ', ''];
    }
    ret = {
        httpVersion: n[1],
        statusCode: +n[2],
        reasonPhrase: n[4]||'',
        headers: {},
    };
    if (!details.responseHeaders)
        return ret;
    try {
        // XXX alexeym/shachar/bahaa: sometimes it fails in Firefox,
        // need to find why: Permission denied to access property "forEach"
        details.responseHeaders.forEach(function(hdr){
            ret.headers[hdr.name.toLowerCase()] = hdr.value; });
    } catch(e){}
    return ret;
}

function hdrs_rm(hdrs, name){
    for (var i=0; i<hdrs.length; i++)
    {
        if (hdrs[i].name.toLowerCase()!=name)
            continue;
        hdrs.splice(i, 1);
        return true;
    }
    return false;
}

function hdrs_add(hdrs, name, value){
    // XXX bahaa: hdrs_rm(hdrs, name)?
    hdrs.push({name: name, value: value});
    return true;
}

class Bw_perr_acc {
    constructor(){
        this.data = {};
    }
    _send(bw_rule, acc){
        acc.id = bw_rule.id;
        be_lib.perr_ok({id: 'req_bw', info: {len: acc.len, ms: acc.ms,
            id: acc.id, country: acc.rule && acc.rule.country}});
        delete this.data[bw_rule.id];
    }
    push(bw_rule, req){
        let acc = this.data[bw_rule.id];
        if (acc && acc.rule!=req.opt.rule)
            this._send(bw_rule, acc);
        acc = this.data[bw_rule.id] = this.data[bw_rule.id]||{len: 0, ms: 0,
            rule: req.opt.rule};
        acc.len += +req.proxy_resp.len;
        acc.ms += Date.now()-req.start_ts;
        // XXX sergeir: sending bw stats every 10MiB
        if (acc.len>(bw_rule.sample_size||10*1024*1024))
            this._send(bw_rule, acc);
    }
}

let bw_perr_acc = new Bw_perr_acc();

function get_bw_perr_rule(req){
    if (!req || !req.proxy_resp)
        return false;
    // rule for netflix, may differ for others
    if (req.method!='GET')
        return false;
    return bw_perr_conf.find(r=>r.url.find(re=>re.test(req.url)));
}

E.get_bw_rule_by_host = function(host){
    return bw_perr_conf.find(r=>r.host.find(re=>re.test(host))); };

class Base_handler {
    constructor(){
        var b = be_util.browser_guess;
        this.listener_opt = {urls: ['<all_urls>']};
        this.listener_extra_opt = ['blocking'];
        if (b.browser=='chrome' || b.browser=='firefox' && +b.version>=53)
            this.listener_extra_opt.push('requestBody');
        this.tab_unblocker_end_cb = cb_wrapper(
            this._unsafe_tab_unblocker_end_cb);
        this.on_before_send_headers = ff_cb_wrapper(
            'on_before_send_headers', d=>{
            trace_req(d, 'send headers');
            this.tab_unblocker_cb(d = assign({}, d, {handler:
                this._on_before_send_headers.bind(this),
                cbname: 'on_before_send_headers', ret: {}}));
            var trace = proxy_debug && E.routing_trace[d.requestId];
            if (trace)
            {
                trace = trace.trace;
                d.ret.requestHeaders = d.ret.requestHeaders ||
                    d.requestHeaders||[];
                hdrs_add(d.ret.requestHeaders, 'X-Hola-Unblocker-Bext',
                    build_trace_string(d.requestId, trace));
                hdrs_add(d.ret.requestHeaders, 'X-Hola-Request-Id',
                    d.requestId);
            }
            return d.ret;
        });
        this.on_headers_received = ff_cb_wrapper('on_headers_received', d=>{
            trace_req(d, 'headers received');
            this.tab_unblocker_cb(d = assign({}, d, {handler:
                this._on_headers_received.bind(this),
                cbname: 'on_headers_received', ret: {}}));
            var trace = proxy_debug && E.routing_trace[d.requestId];
            if (trace)
            {
                trace = trace.trace;
                d.ret.responseHeaders = d.ret.responseHeaders ||
                    d.responseHeaders||[];
                hdrs_add(d.ret.responseHeaders, 'X-Hola-Unblocker-Bext',
                    build_trace_string(d.requestId, trace));
                hdrs_add(d.ret.responseHeaders, 'X-Hola-Request-Id',
                    d.requestId);
            }
            var debug = DEBUG_REQS.find(f=>f.url.test(d.url) &&
                f.status==d.statusCode);
            if (!debug)
                return d.ret;
            var agent = E.requests[d.requestId]&&E.requests[d.requestId].agent;
            zerr.notice('tab:%d request headers received %d %s, agent(%s) '
                +'info: %s', d.tabId, d.statusCode, d.url.slice(0, 100),
                agent&&agent.host, debug.info(d));
            if (!debug.vpn_dns || !agent)
                return d.ret;
            debug.vpn_dns--;
            etask([function(){
                // XXX grzegorz: make configurable
                return ajax.json({url: 'http://'+agent.ip +':3358/debug'
                    +'/vpn_dns'});
            }, function(ret){
                if (!ret || !ret.active_dns)
                    return;
                zerr.notice('tab:%d agent %s active dns %s', d.tabId,
                    agent.host, ret.active_dns);
            }, function catch$(){
                zerr.notice('tab:%d agent %s failed to get active dns',
                    d.tabId, agent.host);
            }]);
            return d.ret;
        });
        // on_completed and on_error_occurred are merged in firefox, so this
        // will also be called for errors
        this.on_completed = ff_cb_wrapper('on_completed', d=>{
            trace_req(d, 'completed');
            this.tab_unblocker_end_cb(d = assign({}, d, {cbname:
                'on_completed', ret: {}}));
            return d.ret;
        });
        this.on_error_occurred = cb_wrapper(d=>{
            this.tab_unblocker_end_cb(assign(d, {cbname: 'on_error_occurred',
                ret: {}}));
            return d.ret;
        });
    }

    static get_handler(){
        if (zutil.get(window, 'browser.proxy.onRequest'))
            return new Ff_new_handler();
        return new Chrome_handler();
    }

    init(){
        if (this.inited)
            return;
        this.inited = true;
        chrome.webRequest.onBeforeSendHeaders.addListener(
            this.on_before_send_headers, this.listener_opt,
            ['blocking', 'requestHeaders']);
        chrome.webRequest.onHeadersReceived.addListener(
            this.on_headers_received, this.listener_opt,
            ['blocking', 'responseHeaders']);
        chrome.webRequest.onCompleted.addListener(this.on_completed,
            this.listener_opt);
        chrome.webRequest.onErrorOccurred.addListener(this.on_error_occurred,
            this.listener_opt);
        return true;
    }

    uninit(){
        if (!this.inited)
            return;
        this.inited = false;
        chrome.webRequest.onBeforeSendHeaders.removeListener(
            this.on_before_send_headers);
        chrome.webRequest.onHeadersReceived.removeListener(
            this.on_headers_received);
        chrome.webRequest.onCompleted.removeListener(this.on_completed);
        chrome.webRequest.onErrorOccurred.removeListener(
            this.on_error_occurred);
        return true;
    }

    // overwritten in children
    _gen_proxy_req(){}

    gen_proxy_req(req, details, cmd, country){
        this._gen_proxy_req(req, details, cmd, country);
        if (!req.agent || req.agent.ip==(this.last_agent||{}).ip)
            return;
        zerr.notice('tab:%d proxy agent selected %O %s', details.tabId,
            req.agent, req.url.slice(0, 100));
        var rule;
        if (rule = req.opt.rule)
        {
            zerr.notice('tab:%d rule %O', details.tabId,
                zutil.pick(rule||{},
                'id', 'name', 'country', 'description', 'peer'));
        }
        this.last_agent = req.agent;
    }
    _on_first_request(details, opt){
        var url = details.url;
        var req = E.requests[details.requestId];
        var country = opt.country || opt.rule && opt.rule.country || '';
        var pool = opt.rule && opt.rule.pool &&
            be_agent.has_pool(country, opt.rule.pool) && opt.rule.pool;
        if (!req)
        {
            var force = storage.get('be_force_strategy') || opt.force ||
                (opt.rule && opt.rule.md5=='premium' ? 'proxy' : null);
            req = E.requests[details.requestId] = {
                id: details.requestId,
                url: url,
                strategy: unblocker_lib.handle_request(url, {
                    force: force,
                    top_url: opt.rule ? zurl.add_proto(opt.rule.name)+'/' :
                        opt.int_req && opt.int_req.hdrs ?
                        opt.int_req.hdrs.Referer : null,
                    type: details.is_main ? 'main_frame' : details.type,
                    method: details.method,
                    country: country.toUpperCase(),
                    premium: be_agent.get_agents_type(country)=='vpn',
                    pool: pool,
                }),
                method: details.method,
                opt: opt,
                route_opt: {direct: 1},
                start_ts: Date.now(),
            };
            trace_req(details, 'new req '+req.strategy.desc);
        }
        req.proxy_req = false;
        if (req.cancel)
        {
            trace_req(details, 'canceling req');
            return void (details.ret.cancel = true);
        }
        var cmd = req.strategy(req.direct_resp, req.proxy_resp);
        if (!cmd)
            return void trace_req(details, 'no strategy command');
        if (req.serving)
        {
            if (req.serving=='proxy')
                return void this.gen_proxy_req(req, details, cmd, country);
        }
        else if (cmd.proxy)
        {
            if (cmd.direct && cmd.direct.serve)
            {
                // before request we prefer to serve direct (easier)
                req.serving = 'direct';
                trace_req(details, 'serving direct '+cmd.log);
            }
            else if (cmd.proxy.serve)
            {
                req.serving = 'proxy';
                trace_req(details, 'serving proxy '+cmd.log);
                this.gen_proxy_req(req, details, cmd, country);
            }
            else if (cmd.proxy.start)
                this.gen_proxy_req(req, details, cmd, country);
            else if (cmd.direct.start)
                req.direct_req = true;
            else if (cmd.proxy.abort)
            {
                trace_req(details, 'aborting proxy '+cmd.log);
                return void (details.ret.cancel = true);
            }
            if (cmd.direct && cmd.direct.abort && req.direct_req)
            {
                trace_req(details, 'aborting direct '+cmd.log);
                req.direct_req.abort();
            }
        }
        else if (cmd.direct)
        {
            if (cmd.direct.serve)
            {
                trace_req(details, 'serving direct '+cmd.log);
                req.serving = 'direct';
            }
            else if (cmd.direct.start)
                req.direct_req = true;
            else if (cmd.direct.abort)
            {
                trace_req(details, 'aborting direct '+cmd.log);
                return void (details.ret.cancel = true);
            }
        }
    }

    _on_before_send_headers(details){
        var url = details.url, req = E.requests[details.requestId];
        var req_hdrs = details.requestHeaders;
        var modified = 0;
        var is_http = url.startsWith('http:') && !url.includes(':443/');
        if (!req)
            return void trace_req(details, 'no req');
        var int_req = req.opt.int_req;
        if (int_req && int_req.hdrs)
        {
            var hdrs = int_req.hdrs;
            for (var h in hdrs)
                modified |= hdrs_add(req_hdrs, h, hdrs[h]);
        }
        modified |= hdrs_rm(req_hdrs, 'x-hola-version');
        var cmd = req.strategy(req.direct_resp, req.proxy_resp);
        if (req.serving);
        else if (cmd.proxy)
        {
            if (cmd.direct && cmd.direct.start && !req.direct_req)
            {
                req.hdrs = req_hdrs;
                send_direct_ajax(req);
            }
            if (cmd.proxy.start)
            {
                if (is_http)
                {
                    modified |= hdrs_add(req_hdrs, 'X-Hola-Version',
                        be_util.version()+' '+
                        (be_util.get_product()||be_util.browser()));
                }
                if (cmd.proxy.hdrs_only && is_http)
                    modified |= hdrs_add(req_hdrs, 'X-Hola-Headers-Only', '1');
            }
        }
        if (!modified)
            return;
        trace_req(details, 'hdrs modified');
        details.ret.requestHeaders = req_hdrs;
    }

    tab_unblocker_cb(details){
        // XXX shachar: quick hack to avoid exception, need to trace root cause
        if (!details.url)
            return;
        var url = details.url;
        var host = zurl.get_host(url);
        var tab_unblocker = details.tabId && E.tab_unblockers[details.tabId];
        var is_main = is_main_frame(details);
        var rule_info, req, handler = details.handler;
        // XXX pavlo/sergeir: Ff_new_handler works w/o be_pac, this check
        // should be conditional
        if (!be_pac.has_pac)
        {
            trace_req(details, 'no pac'+(details.statusLine ? ' status: '+
                details.statusLine : ''));
            return;
        }
        if (req = E.requests[details.requestId])
        {
            // Got webRequest event on existing browser request
            return handler(details, req.opt);
        }
        if (req = E.routing_reqs[url])
        {
            // Got webRequest for a routing request we already handled but was
            // canceled by chrome kernel before redirect so we load the old
            // request data and continue as if it was redirected
            delete E.routing_reqs[url];
            clearTimeout(req.to);
            req = req.req;
            req.id = details.requestId;
            E.requests[details.requestId] = req;
            return handler(details, req.opt);
        }
        if (req = E.internal_reqs[url])
        {
            // Got webRequest for a request that we initiated internally
            if (host=='internal.hola')
            {
                req.reqid = details.requestId;
                E.internal_reqs[req.url] = req;
                delete E.internal_reqs[url];
                return void(details.ret.redirectUrl = req.url);
            }
            if (req.reqid==details.requestId)
                return handler(details, assign({}, req.opt, {int_req: req}));
        }
        // we can only make proxy decisions onBeforeRequest
        if (details.requestHeaders || details.responseHeaders)
        {
            if (details.statusLine)
                trace_req(details, 'status: '+details.statusLine);
            return;
        }
        /* when the root_url changes on a tab the request is send before we are
         * able to enable/disable the tab unblocking, so we make sure that when
         * loading main_frame urls they are still within the root_url domain */
        if (is_main)
        {
            rule_info = get_rule_info_from_url(url);
            if (!tab_unblocker)
            {
                if (rule_info && details.tabId!=-1)
                {
                    return void tab_unblocker_add(details.tabId, rule_info,
                        url);
                }
            }
            else if (!rule_info || rule_info.root_url!=tab_unblocker.root_url)
            {
                tab_unblocker_del(details.tabId);
                if (rule_info)
                    tab_unblocker_add(details.tabId, rule_info, url);
                return;
            }
        }
        if (!E.is_vpn_allowed(url, is_main))
            return void trace_req(details, 'vpn is not allowed');
        var rule = tab_unblocker && tab_unblocker.rule;
        if (!tab_unblocker && details.tabId==-1 && details.frameId==-1)
        {
            tab_unblocker = E.tab_unblockers[be_tabs.get('active.id')];
            if (rule_info || (rule_info = get_rule_info_from_url(url)))
                rule = rule_info.rule;
            else if (tab_unblocker)
                rule = tab_unblocker.rule;
        }
        if (!rule)
            return;
        if (!be_ext.get('is_premium')&&(tab_unblocker||{}).force_premium)
            return;
        if (!be_ext.get('agent_key') && !storage.get('agent_key'))
        {
            be_lib.perr_err({id: 'be_no_agent_key2', rate_limit: {count: 2}});
            return; // not proxying requests if we don't have a key
        }
        return this._on_first_request(details, {rule: rule});
    }

     _on_headers_received(details){
        var req_id = details.requestId;
        var req = E.requests[req_id];
        var res = nodify_res(details);
        if (!req)
            return void trace_req(details, 'no req');
        if (!res)
            return void trace_req(details, 'invalid res '+details.statusLine);
        var tab_unblocker = details.tabId && E.tab_unblockers[details.tabId];
        var hola_warn = res.headers['x-hola-warning'];
        var hola_agent = res.statusCode==407 &&
            res.headers['proxy-authenticate']=='Basic realm="Hola Unblocker"';
        var int_req = req.opt.int_req;
        if (int_req && req.opt.ignore_redir && !int_req.res && !hola_agent)
        {
            int_req.res = res;
            req.cancel = true;
        }
        // Since the agent ping and verification mechanism is currently tied to
        // rules and rules are assigned to tabs, we don't intiate an agent
        // change if there is no tab associated with this webRequest
        if (hola_warn && tab_unblocker && !tab_unblocker.rule.changing_proxy)
        {
            trace_req(details, hola_warn+' warning from agent',
                {level: 'warn'});
            change_agent(details, req, hola_warn);
        }
        var resp = get_strategy_resp(res);
        if (req.proxy_req)
        {
            if (hola_agent) // ignore 407 authenticate from agent
                return void trace_req(details, 'agent 407');
            req.proxy_resp = resp;
            if (!req.direct_resp)
                req.direct_resp = {slow: true}; // timeout
        }
        else if (req.direct_req)
            req.direct_resp = resp;
        // XXX bahaa: else?
        var cmd = req.strategy(req.direct_resp, req.proxy_resp);
        if (cmd.proxy)
        {
            // if the proxy is hdrs_only, it returned a 302 and will rerun as
            // full proxy, otherwise just serve what we got
            if (cmd.proxy.serve)
            {
                trace_req(details, 'serving proxy '+cmd.log);
                if (req.direct_req)
                {
                    trace_req(details, 'aborting direct request');
                    req.direct_req.abort();
                }
                return void(req.serving = 'proxy');
            }
            if (cmd.direct && cmd.direct.serve)
            {
                trace_req(details, 'serving direct '+cmd.log);
                req.serving = 'direct';
                if (!req.proxy_req || {302: 1, 303: 1, 307: 1}[res.statusCode])
                    return;
                routing_reqs_set(details, req);
                return void(details.ret.redirectUrl = req.url);
            }
            if (cmd.proxy.start && !int_req)
            {
                trace_req(details, 'direct_first redirect');
                req.direct_req = false;
                routing_reqs_set(details, req);
                return void(details.ret.redirectUrl = req.url);
            }
        }
        else if (cmd.direct)
        {
            if (cmd.direct.serve)
            {
                trace_req(details, 'serving direct '+cmd.log);
                return void(req.serving = 'direct');
            }
            routing_reqs_set(details, req);
            return void(details.ret.redirectUrl = req.url);
        }
        // if resp from proxy and no decision yet, serve it as we can't wait
        // any longer
        if (req.proxy_resp)
        {
            if (req.direct_req && !req.direct_resp)
            {
                req.direct_timeout = setTimeout(function(){
                    trace_req(details, 'aborting direct timeout');
                    req.direct_req.abort();
                }, 5000);
            }
            trace_req(details, 'serving proxy direct timeout');
            return void(req.serving = 'proxy');
        }
    }

    _unsafe_tab_unblocker_end_cb(details){
        var reqid = details.requestId;
        var req = E.requests[reqid];
        if (req)
        {
            delete E.requests[reqid];
            delete_trace_req(reqid);
            var agent_req = E.agent_requests[req.url];
            if (agent_req && agent_req.id==req.id)
                delete E.agent_requests[req.url];
            var resp;
            if (details.error)
                resp = {code: 0, error: details.error};
            else
            {
                // chrome is supposed to give us the responseHeaders here (but
                // supposed to is a name of a fish)
                if (details.responseHeaders)
                    resp = get_strategy_resp(nodify_res(details));
            }
            if (resp && !req.serving)
            {
                if (req.proxy_req)
                    req.proxy_resp = resp;
                else if (req.direct_req)
                    req.direct_resp = resp;
            }
            req.strategy(req.direct_resp, req.proxy_resp);
            var int_req = E.internal_reqs[req.url];
            if (int_req)
            {
                if (details.error)
                {
                    int_req.error = details.error;
                    if (!int_req.res)
                        int_req.res = {code: 0, error: int_req.error};
                }
                else if (!int_req.res)
                    int_req.res = nodify_res(details);
            }
        }
        var tab_unblocker = details.tabId && E.tab_unblockers[details.tabId];
        if (tab_unblocker)
        {
            tab_unblocker.last_req_ts = Date.now();
            if (req && req.proxy_req && be_ext.get('gen.req_ip_check') &&
                details.ip && zutil.get(req, 'agent.ip')!=details.ip)
            {
                be_lib.perr_err({id: 'req_direct_err', rate_limit: {count: 1,
                    ms: 10*date.ms.MIN}, info: {url: req.url, ip: details.ip,
                    method: req.method, agent: req.agent,
                    rule: _.pick(req.opt.rule||{}, 'name', 'country'),
                }});
            }
        }
        var bw_perr_r;
        if (bw_perr_r = get_bw_perr_rule(req))
        {
            if (req.proxy_resp.code==200 && !req.proxy_resp.error)
                bw_perr_acc.push(bw_perr_r, req);
            if (bw_perr_r.error_code &&
                bw_perr_r.error_code.includes(req.proxy_resp.code))
            {
                be_lib.perr_err({id: 'bw_req_err_'+bw_perr_r.id,
                    rate_limit: {count: 1, ms: 10*date.ms.MIN}, info: {
                    url: req.url, method: req.method,
                    error: req.proxy_resp.code, agent: req.agent,
                    rule: _.pick(req.opt.rule||{}, 'name', 'country'),
                }});
            }
        }
        if (!tab_unblocker || !req || !details.error)
            return;
        trace_req(details, 'error '+details.error, {level: 'err'});
        if (!zutil.bool_lookup('net::ERR_PROXY_CONNECTION_FAILED '
            +'net::ERR_CONNECTION_CLOSED net::ERR_CONNECTION_RESET '
            +'net::ERR_TIMED_OUT')[details.error])
        {
            return;
        }
        be_lib.perr_err({id: 'req_err', info: {
            url: req.url, method: req.method, error: details.error,
            agent: req.agent, rule: _.pick(req.opt.rule||{},
                'name', 'country'),
        }});
        return ext_on_err(details, req);
    }
}

class Ff_new_handler extends Base_handler {
    constructor(){
        super();
        this.on_proxy_request = ff_cb_wrapper('on_proxy_request', d=>{
            trace_req(d, 'proxy request');
            this.tab_unblocker_cb(d = assign({}, d, {handler:
                this._on_first_request.bind(this),
                cbname: 'on_proxy_request', ret: {}}));
            this._clean_req_to_ret();
            this.req_to_ret[d.requestId] = {ret: d.ret, ts: Date.now()};
            return d.hola_proxy||{type: 'direct'};
        });
        this.on_before_request = ff_cb_wrapper('on_before_request', d=>{
            trace_req(d, 'before request');
            // XXX sergeir: fakeRequest-* aren't processed in on_proxy_reqest
            var data = this.req_to_ret[d.requestId]||{ret: {}};
            delete this.req_to_ret[d.requestId];
            return data.ret;
        });
    }

    // clean requests which don't come to on_before_request (e.g. when AdBlock
    // blocks them)
    _clean_req_to_ret(){
        var clean = {}, now = Date.now();
        for (var id in this.req_to_ret)
        {
            var data = this.req_to_ret[id];
            if (now-data.ts < 5*date.ms.MIN)
                clean[id] = data;
        }
        this.req_to_ret = clean;
    }

    _gen_proxy_req(req, details, cmd, country){
        req.route_opt = {prot: 'https', country: country,
            pool: cmd.proxy.pool};
        if (cmd.proxy.peer)
            req.route_opt.peer = true;
        var proxy = get_proxy_agent(req);
        if (!proxy)
        {
            trace_req(details, 'setting proxy failed');
            req.proxy_resp = {code: 0, error: 'failed set proxy'};
            return; // XXX bahaa: can this ever happen?
        }
        req.proxy_req = true;
        var proxy_str = req.route_opt.prot+' '+proxy.host+':'+proxy.port;
        trace_req(details, 'setting proxy to '+proxy_str);
        details.hola_proxy = {type: req.route_opt.prot, host: proxy.host,
            port: proxy.port};
    }

    init(){
        if (!super.init())
            return;
        this.req_to_ret = {};
        window.browser.proxy.onRequest.addListener(this.on_proxy_request,
            this.listener_opt);
        chrome.webRequest.onBeforeRequest.addListener(this.on_before_request,
            this.listener_opt, this.listener_extra_opt);
    }

    uninit(){
        if (!super.uninit())
            return;
        window.browser.proxy.onRequest.removeListener(this.on_proxy_request);
        chrome.webRequest.onBeforeRequest.removeListener(
            this.on_before_request);
    }
}

class Chrome_handler extends Base_handler {
    constructor(){
        super();
        this.on_before_request = ff_cb_wrapper('on_before_request', d=>{
            trace_req(d, 'before request');
            // provided d obj is not extensible in firefox
            this.tab_unblocker_cb(d = assign({}, d, {handler:
                this._on_first_request.bind(this),
                cbname: 'on_before_request', ret: {}}));
            return d.ret;
        });
    }

    _gen_proxy_req(req, details, cmd, country){
        if (req.redirected) // we've already set proxy for redirected req
        {
            trace_req(details, 'redirected, dont set proxy');
            req.redirected = false;
            return void(req.proxy_req = true);
        }
        req.route_opt = {prot: 'HTTPS', country: country,
            pool: cmd.proxy.pool};
        if (cmd.proxy.peer)
            req.route_opt.peer = true;
        var proxy = get_proxy_agent(req);
        if (!proxy)
        {
            trace_req(details, 'setting proxy failed');
            req.proxy_resp = {code: 0, error: 'failed set proxy'};
            return; // XXX bahaa: can this ever happen?
        }
        req.proxy_req = true;
        var proxy_str = req.route_opt.prot+' '+proxy.host+':'+proxy.port;
        trace_req(details, 'setting proxy to '+proxy_str);
        be_pac.set_proxy_for_url(details.url, proxy_str);
        firefox_redirect(req, details, proxy_str);
    }

    init(){
        if (!super.init())
            return;
        chrome.webRequest.onBeforeRequest.addListener(this.on_before_request,
            this.listener_opt, this.listener_extra_opt);
    }

    uninit(){
        if (!super.uninit())
            return;
        chrome.webRequest.onBeforeRequest.removeListener(
            this.on_before_request);
    }
}

function get_strategy_resp(res){
    var resp;
    if (res.headers['x-hola-response'])
    {
        resp = {
            hdrs_only: true,
            code: res.headers['x-hola-status-code'],
            len: res.headers['x-hola-content-length'],
            te: res.headers['x-hola-transfer-encoding'],
            lmod: res.headers['x-hola-last-modified'],
            etag: res.headers['x-hola-etag'],
            type: res.headers['x-hola-content-type'],
            error: res.headers['x-hola-error'],
        };
    }
    else
    {
        resp = {
            code: res.statusCode,
            len: res.headers['content-length'],
            te: res.headers['transfer-encoding'],
            lmod: res.headers['last-modified'],
            etag: res.headers.etag,
            type: res.headers['content-type'],
            error: res.headers['x-hola-error']
        };
    }
    resp.policy = res.headers['x-hola-policy'];
    return resp;
}

E.is_vpn_allowed = function(_url, is_main){
    var url = zurl.parse(_url);
    var protocol = url.protocol;
    var hostname = url.hostname;
    var port = url.port;
    if (!protocol || !hostname)
    {
        if (protocol!='file:')
            be_lib.perr_err({id: 'url_parsing_failed', info: url});
        return false;
    }
    // XXX alexeym: need to find a way to check complex intranet domains
    // like http://local.web/
    if (!hostname.includes('.'))
        return false;
    if (be_agent.is_agent(hostname))
        return false;
    var protocols = {'http:': 1, 'https:': 1};
    if (be_ext.get('gen.wss_on'))
        protocols['wss:'] = 1;
    if (be_ext.get('gen.ws_on'))
        protocols['ws:'] = 1;
    if (!protocols[protocol])
        return false;
    if (port && !{'http:80': 1, 'https:443': 1, 'ws:80': 1, 'wss:443': 1}
        [protocol+port])
    {
        return false;
    }
    if (zurl.is_ip(hostname))
    {
        if (is_main)
            return false;
        if (browser.isInNet(hostname, '10.0.0.0', '255.0.0.0') ||
            browser.isInNet(hostname, '172.16.0.0', '255.240.0.0') ||
            browser.isInNet(hostname, '192.168.0.0', '255.255.0.0') ||
            browser.isInNet(hostname, '127.0.0.0', '255.0.0.0'))
        {
            return false;
        }
    }
    if (zurl.get_top_level_domain(hostname)=='localhost' ||
        zurl.is_hola_domain(hostname))
    {
        return false;
    }
    return true;
};

// We must use cb_wrapper() when defining the callbacks rather than when
// registering them, because on unregisteration, we must provide the exact same
// functions we used for registration.

function build_trace_string(req_id, trace){
    return 'reqid '+req_id+': '+trace.join(', ');
}

function trace_req(req, msg, opt){
    if (!proxy_debug && !opt)
        return;
    // XXX shachar: quick hack to avoid exception, need to trace root cause
    if (!req || !msg)
        return;
    opt = _.defaults(opt||{}, {level: 'debug'});
    zerr[opt.level]('tab:%d be_tab_unblocker: %s %s %s', req.tabId,
        req.requestId||req.id, req.url, msg);
    var trace = E.routing_trace[req.requestId||req.id];
    if (!trace)
    {
        trace = E.routing_trace[req.requestId||req.id] = {trace: [],
            ts: Date.now(), url: req.url};
    }
    if (req.url!=trace.url)
    {
        msg+=' '+req.url;
        trace.url = req.url;
    }
    if (proxy_debug_timing)
    {
        var current_time = Date.now();
        var ts_diff = current_time-trace.ts;
        trace.ts = current_time;
        msg = '+'+ts_diff+'ms '+msg;
    }
    trace.trace.push(msg);
}

function change_agent(details, req, reason){
    var bad_agents = be_agent.agents[be_vpn_util.gen_route_str(req.route_opt,
        {no_algo: true}).toLowerCase()];
    var tab_unblocker = details.tabId && E.tab_unblockers[details.tabId];
    if (!bad_agents)
    {
        be_lib.perr_err({id: 'debug_null_agents', info: {
            agents: be_agent.agents,
            req: req,
            details: details,
        }});
    }
    be_lib.perr_ok({id: 'be_tab_unblocker_change_agent',
        info: {reason: reason, bad_agents: _.pluck(bad_agents, 'host')}});
    var root_url;
    if (root_url = details.tabId && be_tabs.get_url(details.tabId))
        root_url = svc_util.get_root_url(root_url);
    return E.be_rule.change_proxy({
        rule: tab_unblocker.rule,
        zgettunnels_retry: be_defines.ZGETTUNNELS_RETRY,
        exclude: _.pluck(bad_agents, 'host'),
        root_url: root_url||'',
    });
}

function ext_on_err(details, req){
    return etask([function(){
        var tab_unblocker = details.tabId && E.tab_unblockers[details.tabId];
        if (tab_unblocker.rule.changing_proxy)
            return this.return();
        return change_agent(details, req, details.error);
    }, function(res){
        // XXX nikita: enable by default
        if (!(res||{}).error || !bext_config.reload_on_success)
            B.tabs.reload(details.tabId);
    }]);
}

function get_proxy_agent(req){
    var agents, opt = req.opt||{};
    agents = force_agent ? [force_agent] : opt.agent ? [opt.agent] :
        be_agent.get_chosen_agent(be_vpn_util.gen_route_str(req.route_opt,
        {no_algo: true}).toLowerCase(), zutil.get(req, 'opt.rule'));
    if (!agents || !agents.length)
    {
        be_lib.perr_err({id: 'be_debug_no_agents',
            info: zerr.json({route_opt: req.route_opt,
            agents: be_agent.agents})});
        return;
    }
    req.agent = agents[opt.agent ? 0 : req.agent_failures||0];
    return {ip: req.agent.ip, port: req.agent.port, host: req.agent.host};
}

function get_rule_info_from_url(url){
    var rule_info, r;
    url = (url||'').replace('.trigger.hola.org', '');
    for (r in E.url_to_rule_infos)
    {
        rule_info = E.url_to_rule_infos[r];
        if (rule_info.url_re && rule_info.url_re.test(url))
            return rule_info;
    }
    return null;
}

E.get_rule_info = function(rule){
    var rule_info, r = rule;
    if (!E.rules)
        return null;
    if (r.root_url && (rule_info = E.url_to_rule_infos[r.root_url[0]]))
        return rule_info;
    if ((r = svc_util.find_rule(E.rules.unblocker_rules, r)) && r.root_url)
        rule_info = E.url_to_rule_infos[r.root_url[0]];
    return rule_info;
};

function tab_unblocker_del(tabid, refresh){
    var tab_unblocker = E.tab_unblockers[tabid];
    if (!tab_unblocker)
        return;
    var rule_info = E.url_to_rule_infos[tab_unblocker.root_url];
    delete E.tab_unblockers[tabid];
    if (!rule_info)
    {
        be_lib.perr_err({id: 'be_rule_info_missing', info: {tabid: tabid,
            tab_unblocker: tab_unblocker, rule_infos: E.url_to_rule_infos}});
    }
    else
        delete rule_info.tabs[tabid];
    if (!refresh || be_tabs.get('active.id')!=tabid)
        return;
    B.tabs.get(B.tabid2api(tabid), function(tab){
        if (tab)
            B.tabs.update(tab.id, {url: tab.url});
    });
}

function tab_reload(tabid, tab_url){
    B.tabs.update(tabid, {url: tab_url});
    B.tabs.get(tabid, function(tab){
        if (!tab || tab.status!='complete')
            return;
        B.tabs.reload(tabid);
    });
}

function get_force_premium_rule(tab_url){
    var root_url = svc_util.get_root_url(tab_url);
    return premium.get_force_premium_rule(root_url);
}

var tab_unblocker_add = cb_wrapper(function(tabid, rule_info, tab_url,
    fix_url)
{
    if (!rule_info || rule_info.tabs[tabid])
        return;
    var tab_unblocker = E.tab_unblockers[tabid];
    if (tab_unblocker)
        return;
    tab_unblocker = {country: rule_info.rule.country, rule: rule_info.rule,
        root_url: rule_info.root_url,
        force_premium: get_force_premium_rule(tab_url)};
    E.tab_unblockers[tabid] = tab_unblocker;
    rule_info.tabs[tabid] = true;
    if (be_tabs.get('active.id')==tabid)
    {
        if (fix_url)
        {
            tab_url = be_vpn_util.get_root_link(rule_info.rule, tab_url)||
                tab_url;
        }
        if (tab_url)
            tab_reload(tabid, tab_url);
    }
});

var on_tab_created = cb_wrapper(function(o){
    var tab = o.tab;
    if (!tab.url)
        return;
    var rule_info = get_rule_info_from_url(tab.url);
    tab_unblocker_add(tab.id, rule_info, tab.url);
});

var on_tab_updated = cb_wrapper(function(o){
    var id = o.id, info = o.info;
    if (!info || !info.url)
        return;
    var tab_unblocker = E.tab_unblockers[id];
    var rule_info = get_rule_info_from_url(info.url);
    if (tab_unblocker &&
        rule_info && tab_unblocker.root_url==rule_info.root_url)
    {
        return;
    }
    if (tab_unblocker)
        tab_unblocker_del(id);
    tab_unblocker_add(id, rule_info, info.url);
});

var on_tab_removed = cb_wrapper(function(o){ tab_unblocker_del(o.id); });

var on_tab_replaced = cb_wrapper(function(o){
    var added = o.added, removed = o.removed;
    tab_unblocker_del(removed);
    B.tabs.get(added, function(tab){
        if (!tab || !tab.url)
            return;
        var rule_info = get_rule_info_from_url(tab.url);
        tab_unblocker_add(added, rule_info, tab.url);
    });
});

function unset_rule_for_url(root_url, refresh){
    var rule_info = E.url_to_rule_infos[root_url];
    if (!rule_info)
        return;
    for (var tab in rule_info.tabs)
        tab_unblocker_del(tab, refresh);
    delete E.url_to_rule_infos[root_url];
}

function set_rule_for_url(root_url, rule, fix_url){
    var rule_info = E.url_to_rule_infos[root_url];
    if (rule_info)
        unset_rule_for_url(root_url, 0);
    rule_info = E.url_to_rule_infos[root_url] = {
        rule: rule,
        root_url: root_url,
        tabs: {},
        url_re: new RegExp(root_url),
        country_str: be_vpn_util.gen_route_str({country: rule.country,
            peer: rule.peer, pool: rule.pool}).toLowerCase(),
    };
    B.tabs.query({}, cb_wrapper(function(tabs){
        if (!tabs)
            return;
        for (var i=0; i<tabs.length; i++)
        {
            if (rule_info.url_re && !rule_info.url_re.test(tabs[i].url))
                continue;
            tab_unblocker_add(tabs[i].id, rule_info, tabs[i].url, fix_url);
        }
    }));
}

function update_rules(urls){
    var url, rule;
    for (url in E.url_to_rule_infos)
    {
        rule = urls[url];
        if (!rule)
            unset_rule_for_url(url, 1);
        else if (rule.id!=E.url_to_rule_infos[url].rule.id)
            set_rule_for_url(url, rule, 0);
    }
    for (url in urls)
    {
        rule = urls[url];
        if (!E.url_to_rule_infos[url])
            set_rule_for_url(url, rule, 1);
    }
}

// XXX amir: temp workaround for cyclic dependency
be_pac.init_tab_listeners = function(){
    if (requests_handler)
        requests_handler.init();
};

E.update_rule_urls = function(rules){
    var url_to_rule_infos = {};
    return etask([function(){
        if (!E.inited)
            return this.return();
        be_pac.rules = E.rules = rules;
        requests_handler.init();
        be_pac.load_pac_file();
        if (!rules)
            return this.return(update_rules(url_to_rule_infos));
        var ag_rules = [], agents = {};
        for (var r in rules.unblocker_rules)
        {
            var rule = rules.unblocker_rules[r];
            if (!rule.enabled)
                continue;
            rule.root_url_re = [];
            for (var i=0; i<rule.root_url.length; i++)
            {
                // skip astrix '**' root_urls which match everything
                if (rule.root_url_orig && rule.root_url_orig[i].match(/^\*+$/))
                    continue;
                rule.root_url_re.push(new RegExp(rule.root_url[i]));
                url_to_rule_infos[rule.root_url[i]] = rule;
            }
            if (!rule.root_url_re.length)
            {
                delete rules.unblocker_rules[r];
                continue;
            }
            var def = [{peer: true}, {peer: false}];
            if (rule.pool)
                def.push({peer: false, pool: rule.pool});
            def.forEach(function(b){
                b = assign({country: rule.country}, b);
                var s = be_vpn_util.gen_route_str(b).toLowerCase();
                be_agent.agents[s] = be_agent.agents[s]||[];
                if (!agents[s])
                {
                    ag_rules.push(b);
                    agents[s] = true;
                }
            });
        }
        be_agent.set_rules(ag_rules);
        return be_agent.resolve_agents(ag_rules);
    }, function(){
        update_rules(url_to_rule_infos);
        return void unblocker_lib.unblocker_json_set(E.rules||{},
            {by_rules: 1, ext: 1});
    }]);
};

E.ajax_via_proxy = function(url, _opt){
    var opt = {};
    _opt = _opt||{};
    if (typeof url=='object')
        opt = url;
    else
        opt = {type: 'POST', url: url};
    var _this, xhr, xhr_resp, complete;
    return etask([function(){
        var rule = opt.rule;
        _this = this;
        if ((rule || _opt.force=='proxy') && !_opt.country)
        {
            var r = rule||get_rule_info_from_url(opt.url);
            if (r)
            {
                _opt.country = r.country;
                _opt.peer = _opt.peer||r.peer;
            }
            else
                throw new Error('proxy rule not found for '+opt.url);
            _opt.force = 'proxy';
        }
        var req_opts = {force: _opt.force, country: _opt.country,
            no_routing: true, peer: _opt.peer};
        if (_opt.ignore_redir!=false)
            req_opts.ignore_redir = true;
        if (_opt.prot)
            req_opts.prot = _opt.prot;
        if (_opt.agent)
            req_opts.agent = _opt.agent;
        xhr = hola_XMLHttpRequest(opt.url, opt.type, _opt.hdrs, req_opts);
        xhr.onreadystatechange = cb_wrapper(function(){
            if (xhr.readyState==xhr.DONE)
                return void _this.continue();
            if (xhr.readyState==xhr.HEADERS_RECEIVED)
            {
                var headers_s = xhr.getAllResponseHeaders();
                xhr_resp = {
                    statusCode: xhr.status,
                    reasonPhrase: xhr.statusText,
                    headers: attrib.to_obj_lower(attrib.from_str(headers_s,
                        {allow_invalid: true})),
                };
                if (_opt.hdrs_abort)
                    xhr.abort();
            }
        });
        xhr.onerror = function(ev){ _this.throw('XMLHttpRequest error'); };
        xhr.send(_opt.data);
        return this.wait(opt.timeout);
    }, function cont(){
        var req = E.internal_reqs[opt.url];
        complete = true;
        delete E.internal_reqs[xhr.hola_url];
        if (!req)
            req = {};
        if (!req.res)
        {
            if (xhr_resp)
                req.res = xhr_resp;
            else
            {
                var headers_s = xhr.getAllResponseHeaders();
                req.res = xhr_resp = {
                    statusCode: xhr.status,
                    reasonPhrase: xhr.statusText,
                    headers: attrib.to_obj_lower(attrib.from_str(headers_s,
                        {allow_invalid: true})),
                };
            }
        }
        else if (!xhr_resp)
            xhr_resp = req.res;
        return {data: xhr.responseText, xhr: xhr,
            status: xhr_resp.statusCode, orig_res: req.res};
    }, function catch$(err){
        if (_opt.always && xhr && !complete)
            return this.goto('cont');
        throw new Error(err.statusText||''+err);
    }, function finally$(){
        if (xhr)
            delete E.internal_reqs[xhr.hola_url];
        delete E.internal_reqs[opt.url];
    }]);
};

var on_tab_ready = cb_wrapper(function(o){
    var url = o && o.info ? o.info.url : undefined;
    if (!url)
        return;
    if (url_check[url])
    {
        url_check[url]();
        delete url_check[url];
    }
});

var url_check = {};
function is_blocked_site(direct_resp, proxy_resp){
    var p = proxy_resp, d = direct_resp;
    // proxy request failed, can't make a decision so just assume it's not
    // blocked to avoid false positives
    if (!p.statusCode || p.error || p.headers['x-hola-error'])
        return false;
    // direct request failed, probably blocked
    if (!d.statusCode || d.error)
    {
        // XXX shachar: this check was in the original code, check with
        // alexeym why it's needed
        return p.statusCode!=502;
    }
    if (d.statusCode==p.statusCode)
    {
        // request failed with the same status, probably 404 if no favicon,
        // no reason to suspect blocking
        if (d.statusCode!=200)
            return false;
        // make sure that either they have the same length or are chunked
        // encoding
        if (d.statusCode==200 &&
            d.headers['content-length']==p.headers['content-length'] &&
            d.headers['transfer-encoding']==p.headers['transfer-encoding'])
        {
            return false;
        }
        // we got 200 but the content was different, looks like someone inject
        // an invalid response to us
        return true;
    }
    // direct response was different than proxy:
    // - proxy success: means direct was simply blocked.
    // - direct success: means direct was blocked by sending a generic 200
    //   success response.
    // - both failed: but failure was different, means favicon doesn't
    //   exist but the block returned a different indication.
    // no matter how we look at it, site plobably blocked.
    return true;
}

E.check_gov_blocking = function(url){
    if (typeof url!='string' || !E.is_vpn_allowed(url, true))
        return;
    var host = zurl.get_host(url);
    var host_cache = E.hosts_cache[host];
    if (!host_cache)
        host_cache = E.hosts_cache[host] = {timers: {}};
    if (host_cache.gov_blocked!==undefined)
        return host_cache.gov_blocked;
    if (host_cache.gov_blocked_testing)
        return;
    host_cache.gov_blocked_testing = true;
    url = zurl.add_proto(host)+'/favicon.ico';
    be_pac.load_pac_file(undefined, true);
    var direct_resp, proxy_resp, gov_blocked;
    return etask([function(){
        return E.ajax_via_proxy({url: url, type: 'GET'}, {force: 'direct',
            always: true, hdrs_abort: true, ignore_redir: false,
            hdrs: {'Cache-Control': 'no-cache,no-store,must-revalidate,'+
            'max-age=-1'}});
    }, function(resp){
        direct_resp = resp.orig_res;
        return etask.sleep(1000);
    }, function(){
        return E.ajax_via_proxy({url: url, type: 'GET'}, {force: 'proxy',
            country: 'us', always: true, hdrs_abort: true, ignore_redir: false,
            hdrs: {'Cache-Control': 'no-cache,no-store,must-revalidate,'+
            'max-age=-1'}});
    }, function(resp){
        proxy_resp = resp.orig_res;
        if (!(gov_blocked=is_blocked_site(direct_resp, proxy_resp)))
            return this.return(false);
        return etask.sleep(1000);
    }, function(){
        // alexeym: in case of proxy success, need to check direct status
        // one more time – to be sure in case of non-stable connection
        return E.ajax_via_proxy({url: url, type: 'GET'}, {force: 'direct',
            always: true, hdrs_abort: true, ignore_redir: false,
            hdrs: {'Cache-Control': 'no-cache,no-store,must-revalidate,'+
            'max-age=-1'}});
    }, function(resp){
        direct_resp = resp.orig_res;
        return gov_blocked = is_blocked_site(direct_resp, proxy_resp);
    }, function catch$(err){
        gov_blocked = undefined;
        return false;
    }, function finally$(){
        host_cache.gov_blocked_testing = false;
        host_cache.gov_blocked = gov_blocked;
        clearTimeout(host_cache.timers.gov_blocked);
        host_cache.timers.gov_blocked = setTimeout(function(){
            host_cache.gov_blocked = undefined; }, HOUR);
    }]);
};

E.rewrite_to_proxy = function(url, tab_id, country){
    country = country||'us';
    be_pac.load_pac_file(undefined, true);
    url = zurl.add_proto(url);
    url = url.replace(/^https:/, 'http:');
    var req_url = make_internal_request(url, {
        'Cache-Control': 'no-cache,no-store,must-revalidate,max-age=-1',
        'X-Hola-Blocked-Response': '1'},
        {ignore_redir: true, once: true, force: 'proxy', country: country});
    B.tabs.update(tab_id, {url: req_url});
};

E.uninit = function(){
    if (!E.inited)
        return;
    E.sp.return();
    E.update_rule_urls();
    be_pac.set_pac(null);
    // XXX amir: temp workaround for circular dependency with pac.js
    be_pac.rules = E.rules = null;
    ff_exported.forEach(function(o){ window[o.name] = null; });
    E.inited = 0;
    requests_handler.uninit();
    E.requests = {};
    E.routing_reqs = {};
    chrome.runtime.onMessage.removeListener(on_devtools_pane);
    for (var hc in E.hosts_cache)
    {
        for (var t in E.hosts_cache[hc].timers)
            clearTimeout(E.hosts_cache[hc].timers[t]);
    }
    E.hosts_cache = {};
    E.stopListening();
};

function on_devtools_pane(req, sender, cb){
    if (req.devtool_pane)
        return void cb({create: true});
    if (req.get_trace)
    {
        var trace = E.routing_trace[req.get_trace];
        delete_trace_req(req.get_trace);
        return void cb(trace);
    }
}

function delete_trace_req(id){
    var trace = E.routing_trace[id];
    if (!trace)
        return;
    if (trace.handled)
        delete E.routing_trace[id];
    else
        trace.handled = true;
}

E.init = function(opt){
    if (E.inited)
        return;
    requests_handler = Base_handler.get_handler();
    proxy_debug = be_features.have(be_ext, 'proxy_debug');
    proxy_debug_timing = be_features.have(be_ext, 'proxy_debug_timing');
    if (proxy_debug)
        chrome.runtime.onMessage.addListener(on_devtools_pane);
    E.sp = etask('be_tab_unblocker', [function(){ return this.wait(); }]);
    E.url_to_rule_infos = {};
    // XXX bahaa: move to window.hola.*
    ff_exported.forEach(function(o){ window[o.name] = o.fn; });
    E.inited = 1;
    E.listen_to(be_ext, 'change:r.vpn.on', be_pac.load_pac_cb);
    E.listen_to(be_ext, 'change:r.ext.enabled', update_state);
    E.listen_to(be_ext, 'change:bext_config', update_config);
    be_agent.agents.us = be_agent.agents.us||[];
    be_agent.resolve_agents([{country: 'us'}]);
    if (zutil.is_mocha())
        hola_req_id = 0;
    be_lib.perr_ok({id: 'new_unblocker_api_init'});
    update_config();
};

function update_state(){
    var is_enabled = be_ext.get('r.ext.enabled');
    if (is_enabled==E.is_enabled)
        return;
    E.is_enabled = is_enabled;
    E.stopListening(be_tabs);
    if (!E.is_enabled)
        return;
    E.listenTo(be_tabs, 'created', on_tab_created);
    E.listenTo(be_tabs, 'updated', on_tab_updated);
    E.listenTo(be_tabs, 'removed', on_tab_removed);
    E.listenTo(be_tabs, 'replaced', on_tab_replaced);
    E.listenTo(be_tabs, 'committed', on_tab_ready);
    E.listenTo(be_tabs, 'error_occured', on_tab_ready);
}

function update_config(){
    bext_config = be_ext.get('bext_config')||{};
    bw_perr_conf = (bext_config.bw_perr||[]).map(rule=>{
        let res = assign({id: rule.id}, _.omit(rule, 'url', 'host'));
        let url = Array.isArray(rule.url) ? rule.url : [rule.url];
        res.url = url.map(u=>new RegExp('^'+zurl.http_glob_url(u)));
        url = rule.host ? Array.isArray(rule.host) ? rule.host : [rule.host] :
            [];
        res.host = url.map(u=>new RegExp('^'+zurl.http_glob_host(u)));
        return res;
    });
}

E.t = {Base_handler};

return E; });
