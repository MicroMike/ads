// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', 'backbone', '/bext/pub/backbone.js',
    '/util/etask.js', '/util/string.js', '/bext/pub/ext.js',
    '/util/util.js',
    '/bext/pub/util.js', '/util/zerr.js', '/bext/vpn/pub/rule.js',
    '/bext/vpn/pub/info.js', '/bext/pub/browser.js', '/bext/pub/tabs.js',
    '/bext/pub/lib.js', '/svc/pub/util.js', '/util/version_util.js',
    '/bext/vpn/pub/tpopup.js', '/util/escape.js', '/util/url.js',
    '/bext/vpn/pub/tab_unblocker.js', '/bext/vpn/pub/ajax.js',
    '/util/storage.js', '/bext/vpn/pub/util.js', '/util/date.js', 'be_ver',
    '/bext/vpn/pub/agent.js', '/bext/vpn/pub/svc.js', '/bext/vpn/pub/pac.js',
    '/bext/vpn/pub/mode.js', '/bext/vpn/pub/rules.js',
    '/bext/vpn/pub/tab_perr.js', '/bext/vpn/pub/iframe.js',
    'text!bext/vpn/pub/vstat.js', '/bext/vpn/pub/premium.js'],
    function($, _, Backbone, be_backbone, etask, string, be_ext,
    zutil, be_util, zerr,
    be_rule, be_info, B, be_tabs, be_lib, svc_util, version_util, be_tpopup,
    zescape, zurl, be_tab_unblocker, ajax, storage, be_vpn_util, date,
    be_ver, be_agent, be_svc, be_pac, be_mode, be_rules, be_tab_perr,
    be_iframe, vstat, be_premium){
B.assert_bg('be_vpn');
var chrome = window.chrome, conf = window.conf, assign = Object.assign;
var E = new (be_backbone.model.extend({
    tabs: {}, active_tab_id: 0, unblocked_urls: {}, history: {},
    _defaults: function(){
        this.on('destroy', function(){
            B.backbone.server.stop('be_vpn');
            uninit();
        });
        B.backbone.server.start(this, 'be_vpn');
    },
}))();

var active_tab_timer_ms = date.ms.HOUR;

function uninit(){
    if (!E.get('inited'))
        return;
    E.sp.return();
    if (chrome && B.have['web_request.on_auth_required'])
        chrome.webRequest.onAuthRequired.removeListener(zagent_conn_lob_cb);
    clearTimeout(status_cb.timer);
    E.be_rule.off('change:status', status_cb);
    E.be_info.off('change:status', status_cb);
    be_tabs.off('change:active.id', tab_vpn_on_change_active);
    be_tabs.off('created', tab_vpn_on_created);
    be_tabs.off('updated', tab_vpn_on_updated);
    be_tabs.off('committed', tab_vpn_on_comitted);
    be_tabs.off('removed', tab_vpn_on_removed);
    be_tabs.off('replaced', tab_vpn_on_replaced);
    be_tabs.off('error_occured', tab_vpn_on_error_occured);
    proxy_settings_monitor.uninit();
    monitor_active_uninit();
    E.be_tpopup._destroy();
    E.be_rule._destroy();
    E.be_tab_unblocker._destroy();
    E.be_tab_perr._destroy();
    E.be_agent._destroy();
    E.be_pac._destroy();
    E.be_svc._destroy();
    E.be_mode._destroy();
    E.be_info._destroy();
    E.be_rules._destroy();
}

var proxy_settings_monitor = {};
proxy_settings_monitor.init = function(){
    // proxy.settings.(get|on_change) not available in firefox
    if (this.inited || !chrome || conf.firefox_web_ext)
        return;
    this.inited = true;
    B.proxy.settings.get({}, this.changed_cb);
    B.proxy.settings.on_change.add_listener(this.changed_cb);
};
proxy_settings_monitor.uninit = function(){
    if (this.inited)
        B.proxy.settings.on_change.del_listener(this.changed_cb);
};
proxy_settings_monitor.changed_cb = function(details){
    if (!details)
        return zerr('proxy_changed no details');
    var conflict = details.levelOfControl=='controlled_by_other_extensions';
    zerr[conflict ? 'err' : 'debug'](
        'proxy changed: %s control: %s',
        !details.value.pacScript || details.value.pacScript.url ?
        zerr.json(details.value) : 'pacScript-data', details.levelOfControl);
    be_ext._set({'proxy.effective.control_level': details.levelOfControl,
        'proxy.effective.value': details.value, 'ext.conflict': conflict});
};

E.init = function(rmt){
    if (this.get('inited'))
        return;
    E.sp = etask('be_vpn', [function(){ return this.wait(); }]);
    this.set('inited', true);
    this.on('recover', function(){
        if (E.get('need_recover'))
            return;
        E.set('need_recover', true);
        status_cb();
    });
    zerr.on_unhandled_exception = function(err){
        be_lib.perr_err({id: 'unhandled_exception', err: err}); };
    /* XXX arik: need be_collection to unite group of be_backbone */
    E.rmt = rmt;
    E.be_pac = be_pac;
    E.be_tab_unblocker = be_tab_unblocker;
    E.be_tab_perr = be_tab_perr;
    E.be_rule = be_rule;
    E.be_tpopup = be_tpopup;
    E.be_info = be_info;
    E.be_svc = be_svc;
    E.be_agent = be_agent;
    E.be_mode = be_mode;
    E.be_rules = be_rules;
    be_info.init(rmt);
    be_svc.init();
    be_mode.init();
    be_pac.init();
    be_agent.init();
    be_tab_unblocker.init();
    be_tab_perr.init(E);
    be_rules.init();
    be_rule.init(this);
    be_tpopup.init();
    proxy_settings_monitor.init();
    E.be_rule.on('change:status', status_cb);
    E.be_info.on('change:status', status_cb);
    be_tabs.on('change:active.id', tab_vpn_on_change_active);
    be_tabs.on('created', tab_vpn_on_created);
    be_tabs.on('updated', tab_vpn_on_updated);
    be_tabs.on('committed', tab_vpn_on_comitted);
    be_tabs.on('removed', tab_vpn_on_removed);
    be_tabs.on('replaced', tab_vpn_on_replaced);
    be_tabs.on('error_occured', tab_vpn_on_error_occured);
    B.tabs.query({}, function(tabs){
        for (var i=0; i<tabs.length; i++)
            tab_vpn_on_created({tab: tabs[i]});
    });
    E.used_vpn = true;
    if (chrome && B.have['web_request.on_auth_required'])
    {
        chrome.webRequest.onAuthRequired.addListener(zagent_conn_lob_cb,
            {urls: ['<all_urls>']});
    }
    E.sp.spawn(etask({cancel: true}, [function(){
        return load_conf();
    }, function(){
        B.tabs.query({lastFocusedWindow: true, active: true}, function(tabs){
            first_run(tabs&&tabs[0]&&tabs[0].url); });
        return be_lib.storage_local_get('used_vpn');
    }, function(res){
        E.used_vpn = res.used_vpn;
    }]));
    bext_config_init();
    monitor_active_init();
};

// XXX colin: move all vstat code to vstat.js, use init/uninit like
// all other modules
function vstat_init(use_vstat){
    E.use_vstat = use_vstat;
    if (!E.use_vstat)
        return;
    B.be.ccgi.add_listener(msg_cb);
    // XXX colin: can add enable/disable on_tab_comitted
}

function vstat_uninit(){
    if (!E.use_vstat)
        return;
    B.be.ccgi.del_listener(msg_cb);
}

function on_vstat_conf(conf){
    conf = zutil.get(conf, 'vstat', {});
    var domains = {};
    for (var e in conf.domains)
    {
        var rule = conf.domains[e], res = _.omit(rule, 'url');
        if (rule.url)
        {
            res.url = (Array.isArray(rule.url) ? rule.url : [rule.url]).map(
                function(u){ return new RegExp('^'+zurl.http_glob_url(u)); });
        }
        domains[e] = res;
    }
    E.vstat = assign({domains: domains}, _.omit(conf, 'domains'));
    if (conf.enable!=E.use_vstat)
    {
        vstat_uninit();
        vstat_init(conf.enable);
    }
}

function ts_in_range(begin_ts, ts_ar, end_ts){
    return ts_ar.some(function(ts){
        return ts && begin_ts < ts && ts <= end_ts; });
}

var monitor_active = {};
function monitor_active_init(){
    E.sp.spawn(monitor_active.sp = etask({name: 'monitor_active',
        cancel: true}, [function loop()
    {
        var data = storage.get_json('monitor_active')||{};
        var ts = Date.now();
        var period = date.ms.HOUR;
        var end_ts = data.next_perr_ts || ts;
        var begin_ts = end_ts - period;
        var active_ts_ar = [data.unblocker_tab_ts, data.ui_close_ts,
            data.ui_open_ts, data.req_ts];
        if (ts_in_range(begin_ts, active_ts_ar, end_ts))
        {
            be_lib.perr_ok({id: 'be_active', info: {
                begin: begin_ts, end: end_ts, req_ts: data.req_ts,
                unblocker_tab_ts: data.unblocker_tab_ts,
                ui_close_ts: data.ui_close_ts, ui_open_ts: data.ui_open_ts}});
            end_ts += period;
        }
        else if (ts > end_ts)
            end_ts = ts+period;
        data.next_perr_ts = end_ts;
        storage.set_json('monitor_active', data);
        return etask.sleep(date.ms.MIN);
    }, function(){
        var data = storage.get_json('monitor_active')||{};
        var tabs = be_tab_unblocker.tab_unblockers||{};
        if (Object.keys(tabs).length)
        {
            data.unblocker_tab_ts = Date.now();
            data.req_ts = Object.values(tabs).reduce(function(m, tab){
                return tab&&tab.last_req_ts&&Math.max(m, tab.last_req_ts) || m;
            }, 0) || undefined;
        }
        storage.set_json('monitor_active', data);
        return this.goto('loop');
    }, function finally$(){
        delete monitor_active.sp;
    }]));
}

function monitor_active_uninit(){
    if (monitor_active.sp)
        monitor_active.sp.return();
    monitor_active = {};
}

function set_bext_config(bext_config){
    function convert_blob2regexp(e, path){
        var rules = zutil.get(e, path);
        if (!rules)
            return;
        zutil.set(e, path, rules.map(function(rule){
            return assign({}, rule, {
                domain: new RegExp('^'+zurl.http_glob_host(rule.domain)+'$')});
        }));
    }
    if (!bext_config)
    {
        if (!(bext_config = storage.get_json('bext_config_last')))
            return;
    }
    else
        storage.set_json('bext_config_last', bext_config);
    var hola_conf;
    if (hola_conf = storage.get_json('hola_conf'))
        bext_config = zutil.extend_deep(bext_config, hola_conf);
    convert_blob2regexp(bext_config, 'force_premium.rules');
    convert_blob2regexp(bext_config, 'get_privacy.rules');
    be_ext.set('bext_config', bext_config);
}

var config_update_sleep;
var config_stats = {n: 0, err: false, attempt: 0};
function bext_config_init(){
    E.listen_to(be_ext, 'change:bext_config', function(){
        var bext_conf = be_ext.get('bext_config');
        on_vstat_conf(bext_conf);
    });
    return etask({cancel: true, name: 'bext_config_init'},
    [function try_catch$loop(){
        config_update_sleep = null;
        return ajax.json({timeout: 20000, method: 'GET',
            url: conf.url_ccgi+'/bext_config.json?browser='+be_util.browser()+
            '&ver='+((window.RMT||{}).ver||be_util.version())});
    }, function(e){
        config_stats.n++;
        config_stats.attempt++;
        var pause = 2*date.ms.HOUR;
        var err = this.error || e&&e.err, err_info;
        if (err || !e)
        {
            if (config_stats.attempt==1)
                set_bext_config();
            err_info = (err ? err.hola_info : undefined) || {};
            be_lib.perr_err({id: 'be_bext_config_err', err: err,
                info: {n: config_stats.n, after_err: config_stats.err,
                status: err_info.status, exists: !!be_ext.get('bext_config'),
                attempt: config_stats.attempt,
                stamp: zutil.get(be_ext.get('bext_config'), 'stamp')}});
            pause = 5*date.ms.MIN;
        }
        else
        {
            be_lib.perr_ok({id: 'be_bext_config_success',
                info: {n: config_stats.n, after_err: config_stats.err,
                attempt: config_stats.attempt}});
            set_bext_config(e);
            config_stats.attempt = 0;
        }
        config_stats.err = !!err;
        this.set_state('loop');
        return config_update_sleep = etask.sleep(pause);
    }]);
}

E.force_bext_config_update = function(){
    if (!config_update_sleep)
        return;
    config_update_sleep.return();
};

function load_conf(){
    return etask({cancel: true, name: 'load_conf'}, [function try_catch$(){
        return ajax.json({timeout: 20000, method: 'POST',
            url: conf.url_ccgi+'/win_install_init.json'});
    }, function(e){
        if (this.error || e.err)
        {
            be_ext.set('install_conf', null);
            if (this.error)
                be_lib.perr_err({id: 'be_load_conf_err', err: this.error});
            return;
        }
        be_ext.set('install_conf', e);
    }]);
}

var first_run_timer;
function first_run(active){
    var details = be_ext.get('install_details');
    if (!details)
        return;
    be_ext._set('install_details', null);
    var install = details=='install';
    var inst_conf = be_ext.get('install_conf');
    var br = inst_conf && inst_conf.browser && inst_conf.browser.browser;
    // during svc installation, we use bext_install.html for
    // installing the extension - don't show first-run in this case
    var svc_install = inst_conf && inst_conf.name=='exe' && br &&
        br=='chrome'==!!chrome ||
        /^https?:\/\/hola\.org\/bext_install(\.html)?/.test(active) ||
        /^https?:\/\/hola\.org\/(login.*)?(browser_welcome|vpn_config)/
        .test(active);
    var ext_skip_first_run = inst_conf && inst_conf.item &&
        inst_conf.item.ext_skip_first_run;
    var skip_first_run = !!(conf.browser.torch || svc_install ||
        !install || ext_skip_first_run);
    be_lib.perr_ok({id: 'be_first_run', info: {
        svc_install: svc_install, skip_first_run: skip_first_run,
        active: active}});
    if (skip_first_run)
        return;
    first_run_timer = setTimeout(function(){
        be_lib.perr_err({id: 'be_first_run_never'});
        first_run_stop();
    }, 5*date.ms.MIN);
    E.listenTo(be_mode, 'change:is_svc', first_run_cb);
    E.listen_to(be_ext, 'change:enabled', first_run_cb);
}
function first_run_stop(){
    E.stopListening(be_mode, 'change:is_svc', first_run_cb);
    E.stopListening(be_ext, 'change:enabled', first_run_cb);
    first_run_timer = clearTimeout(first_run_timer);
}
function first_run_cb(){
    if (!be_mode.get('is_svc') && !be_ext.get('enabled'))
        return;
    be_lib.perr_ok({id: 'be_first_run_open_tab'});
    first_run_stop();
    be_util.open_hola_tab({url: zescape.uri('https://hola.org/access/install',
        be_ext.auth())});
}

function zagent_conn_lob_cb(details){
    if (details.isProxy && details.realm=='Hola Unblocker')
    {
        var conn_log = E.get('zagent_conn_log')||[];
        conn_log.push({host: details.challenger.host,
            port: details.challenger.port, ts: Date.now()});
        if (conn_log.length>5)
            conn_log.shift();
        E.set('zagent_conn_log', conn_log);
    }
    return {};
}

// XXX arik: rm api
E.enable = function(reload){};

function status_cb(){
    var script = E.be_rule.get('status');
    var info = E.be_info.get('status');
    var status = [script, info];
    if (status.includes('error'))
        E.set('status', 'error');
    else if (status.includes('busy'))
        E.set('status', 'busy');
    else
    {
        E.set('status', 'ready');
        tabs_update();
    }
    if (status.includes('busy') || !E.get('need_recover'))
        return;
    if (E.get('status')=='ready')
        return E.set('need_recover', false);
    clearTimeout(status_cb.timer);
    status_cb.timer = setTimeout(function(){
        zerr.notice('be_vpn try recover');
        E.set('need_recover', false);
        if (E.be_rule.get('status')=='error')
            E.be_rule.recover();
        if (E.be_info.get('status')=='error')
            E.be_info.recover();
    });
}

function active_stop_measure(tab){
    if (!tab.active_ts)
        return;
    tab.active_time += Date.now()-tab.active_ts;
    tab.active_ts = 0;
    active_timer_clr(tab);
}

function active_reset(tab){
    active_stop_measure(tab);
    tab.active_time = 0;
}

function active_start_measure(tab){
    if (tab.active_ts)
        return;
    tab.active_ts = Date.now();
    active_timer_add(tab, active_tab_timer_ms);
}

function active_timer_clr(tab){
    if (!tab.active_timer)
        return;
    tab.active_timer = clearTimeout(tab.active_timer);
}

function active_timer_add(tab, ms){
    active_timer_clr(tab);
    tab.active_timer = setTimeout(function(){
        tab.active_timer = null;
        total_active_report(tab);
    }, ms);
}

function total_active_report(tab){
    active_stop_measure(tab);
    if (tab.active_reported)
        return;
    tab.active_reported = true;
    var rule;
    var loc_country = (zutil.get(be_info.get('location'), 'country')||'')
    .toLowerCase();
    if (rule = tab.rule)
    {
        var first_per_time =
            Date.now()-(E.unblocked_urls[tab.root_url]||0)>24*3600000;
        var stats = assign(_.pick(rule, 'name', 'type', 'md5'),
            {proxy_country: (rule.country||'').toLowerCase()});
        be_lib.stats('be_vpn_total_active_time', JSON.stringify(
            assign(stats, {root_url: tab.root_url, src_country: loc_country,
            total_active_time: tab.active_time/1000,
            first_per_time: first_per_time})));
        if (first_per_time)
            E.unblocked_urls[tab.root_url] = Date.now();
        return;
    }
    /* root_url indicates normal url (not chrome://...) */
    if (!tab.root_url || tab.had_rule || Math.random()*50>=1)
        return;
    be_lib.stats('be_total_active_time', JSON.stringify(
        {root_url: tab.root_url, src_country: loc_country,
        total_active_time: tab.active_time/1000}));
}

function vpn_first_use_report(tab){
    if (!tab.rule || E.used_vpn)
        return;
    be_lib.stats('be_vpn_first_use');
    be_lib.storage_local_set({used_vpn: true});
    E.used_vpn = true;
}

function tab_vpn_add(tab, rule){
    tab.had_rule = true;
    tab.rule = zutil.clone(rule);
    active_reset(tab);
    if (E.active_tab_id==tab.id)
        active_start_measure(tab);
    vpn_first_use_report(tab);
}

function tab_add(tabid, url){
    var tab = E.tabs[tabid];
    var rule = E.rule_get(url);
    if (tab)
        return;
    zerr.debug('tab:%d add url %s root %s', tabid, url,
        svc_util.get_root_url(url));
    tab = {url: url, root_url: svc_util.get_root_url(url),
        active: 0, active_time: 0, rule: rule, id: tabid};
    E.tabs[tabid] = tab;
    if (E.active_tab_id==tabid)
        active_start_measure(tab);
    if (rule)
        tab_vpn_add(tab, rule);
}

function tab_vpn_del(tab){
    if (!tab.rule)
        return;
    total_active_report(tab);
    tab.rule = null;
}

function tab_del(tabid){
    var tab = E.tabs[tabid];
    if (!tab)
        return;
    total_active_report(tab);
    tab_vpn_del(tab);
    delete E.tabs[tabid];
}

function tab_update(tab){
    var rule = E.rule_get(tab.url);
    zerr.debug('tab:%d update url %s is_vpn %O', tab.id, tab.root_url, !!rule);
    if (rule && !tab.rule)
        tab_vpn_add(tab, rule);
    else if (!rule && tab.rule)
        tab_vpn_del(tab);
}

function tabs_update(){
    for (var tab in E.tabs)
        tab_update(E.tabs[tab]);
}

E.rule_get = function(url){
    var rule;
    if (!be_ext.get('r.vpn.on'))
        return null;
    if ((rule = be_rule.get_rules(url)[0]) && rule.enabled)
        return rule;
    return null;
};

var MAX_HISTORY = 5;
function tab_history_update(id, url, del){
    var tab = E.history[id];
    if (!tab)
    {
        if (del)
            return;
        tab = E.history[id] = {history: []};
    }
    else if (del)
        return void delete E.history[id];
    var host = zurl.get_host(url);
    if (!host)
        return;
    if (tab.history.length && host==tab.history[0])
        return;
    tab.history.unshift(host);
    if (tab.history.length>MAX_HISTORY)
        tab.history.pop();
}

E.tab_history_get = function(id){
    if (!(id = id||be_tabs.get('active.id')))
        return;
    var t = E.history[id];
    if (!t)
        return;
    return t.history;
};

function tab_vpn_on_created(o){
    var tab = o.tab;
    if (!tab.url)
        return;
    tab_history_update(tab.id, tab.url);
    tab_add(tab.id, tab.url);
}

function to_form_data(o){
    var data = new FormData();
    for (var k in o)
        data.append(k, o[k]);
    return data;
}

function send_beacon(url, data){
    data.send_type = 'POST';
    var req = new XMLHttpRequest();
    req.open('POST', url);
    req.send(to_form_data(data));
}

function msg_cb(msg){
    var id = msg.id;
    if (msg._type!='be_vstat')
        return;
    id = id.replace(/^vstat\./, '');
    switch (id)
    {
    case 'send_beacon':
        if (msg.data)
            msg.data.build = be_util.build();
        send_beacon(E.vstat.url||msg.url, msg.data);
        break;
    case 'send_event':
        be_lib.perr_ok({id: 'be_vstat_event', info:
            {data: msg.data, hola_uid: be_ext.get('hola_uid')},
            rate_limit: {count: 250}});
        break;
    default: zerr('unknown be_mp message '+zerr.json(msg));
    }
}

function vstat_inject_init(id, root_url){
    var info, tab = E.tabs[id];
    if (!tab || tab.vstat_inited || !tab.rule || !E.vstat)
        return;
    root_url = root_url||tab.root_url;
    if (!(info = (E.vstat.domains||{})[root_url]))
        return;
    var tab_url;
    if (info.url && !((tab_url = be_tabs.get_url(id)) &&
        info.url.some(function(re){ return re.test(tab_url); })))
    {
        return;
    }
    var prefix = '';
    if (info && info.customer)
    {
        var opt = {customer: info.customer, debug: info.debug,
            ver: (window.RMT||{}).ver||be_util.version(), tab_id: id,
            country: tab.rule.country};
        if (info.report)
            opt.report = info.report;
        prefix = 'window.hola_vstat_conf = '+JSON.stringify(opt)+';\n';
    }
    // XXX colin: add allFrames once vstat wont send duplicates
    var details = {};
    if (!chrome)
        details.ccgi = true;
    E.sp.spawn(etask({cancel: true}, [function(){
        return be_iframe.inject(id, prefix+vstat,
            {no_func_wrap: true, func_is_str: true}, details);
    }, function catch$(err){
        be_lib.perr_err({id: 'vstat_inject_failed', info: err});
    }]));
    tab.vstat_inited = true;
}

function tab_vpn_on_comitted(o){
    if (!E.use_vstat)
        return;
    var id = o.id, info = o.info;
    vstat_inject_init(id, svc_util.get_root_url(info.url));
}

function tab_vpn_on_updated(o){
    var id = o.id, info = o.info;
    var tab = E.tabs[id];
    if (tab)
        delete tab.vstat_inited;
    if (!info || !info.url)
        return;
    tab_history_update(id, info.url);
    var root_url = svc_util.get_root_url(info.url);
    if (tab && tab.root_url==root_url)
    {
        tab.url = info.url;
        if (E.use_vstat)
            vstat_inject_init(id, svc_util.get_root_url(info.url));
        return;
    }
    if (tab)
        tab_del(id);
    tab_add(id, info.url);
    if (E.use_vstat)
        vstat_inject_init(id, svc_util.get_root_url(info.url));
}

function tab_vpn_on_removed(tab){
    tab_history_update(tab.id, null, true);
    tab_del(tab.id);
}

function tab_vpn_on_replaced(o){
    var added = o.added, removed = o.removed;
    tab_history_update(removed, null, true);
    tab_vpn_del(removed);
    B.tabs.get(added, function(tab){
        if (!tab || !tab.url)
            return;
        tab_history_update(added, tab.url);
        var root_url = svc_util.get_root_url(tab.url);
        if (!root_url)
            return;
        tab_add(added, tab.url);
    });
}

function tab_vpn_on_change_active(){
    var id = be_tabs.get('active.id');
    if (!id)
        return;
    var tab = E.active_tab_id ? E.tabs[E.active_tab_id] : null;
    if (tab)
        active_stop_measure(tab);
    E.active_tab_id = id;
    if (tab = E.tabs[id])
        active_start_measure(tab);
}

function tab_vpn_on_error_occured(o){
    var info = o.info||{};
    if (info.http_status_code!=0)
        return;
    var last = tab_vpn_on_error_occured.info||{};
    if (last.error==info.error && last.url==info.url && last.tabId==info.tabId)
        return;
    tab_vpn_on_error_occured.info = info;
    var domain = zurl.get_host(''+info.url);
    if (!zurl.is_valid_domain(domain))
        return;
    var rule = E.rule_get(info.url);
    var perr_info = {domain: domain, err: info.error||''};
    if (rule)
        perr_info.proxy_country = rule.country;
    be_lib.perr(zerr.L.INFO, {id: 'be_dns_mistake', info: perr_info,
        rate_limit: {count: 100}});
}

// XXX arik: unite with code in ui_vpn.js
E.script_set = function(rule, val){
    zerr.debug('set rule %s %d %s', rule.name, +val.enabled, val.root_url);
    return etask({name: 'script_set', cancel: true}, [function(){
        return be_ext.set_enabled(true);
    }, function(){
        if (!be_ext.get('r.vpn.on'))
            return E.enable();
    }, function(){
        be_rule.trigger('set_rule', {
            name: rule.name, enabled: +val.enabled,
            country: val.country||rule.country, type: rule.type,
            md5: rule.md5, root_url: val.root_url});
        E.once('change:status', function(){ this.continue(); }.bind(this));
        return this.wait(15*date.ms.SEC);
    }]);
};

// XXX arik: reuse code in ui_vpn.js
// sets rule for root url (enables/disables vpn)
// opt.root_url - root domain to unblock
// [opt.rule] - full rule definition to set. One of opt.rule or opt.country
// must be passed
// [opt.country] - proxy country
E.enable_root_url = function(opt){
    var root_url = opt.root_url, rule_ratings, rule, enabled = true;
    // XXX arik: get link from selected rule
    var host = zurl.get_host('http://'+root_url+'/');
    return etask({name: 'enable_root_url', cancel: true}, [function(){
        be_info.set_force_tpopup(root_url);
        if (opt.rule)
        {
            if (opt.rule.name)
            {
                rule = opt.rule;
                if (rule.enabled!==undefined)
                    enabled = rule.enabled;
                return this.goto('set');
            }
            // XXX arik/shachar: we should never get here. this is due to
            // shachar's changes of taking rule into account in
            // enable_root_url. need to call api with valid rule or don't
            // specify it
            be_lib.perr_err({id: 'be_enable_root_url_invalid_rule',
                info: assign(opt, {hola_uid: be_ext.get('hola_uid')})});
        }
        return be_rule.get_rule_ratings({root_url: root_url,
            src_country: be_info.get('country'), limit: 20,
            proxy_country: opt.country, vpn_only: true});
    }, function(_rule_ratings){
        rule_ratings = _rule_ratings;
        if (!rule_ratings)
            return;
        return be_rule.get_groups_from_ratings(rule_ratings);
    }, function(groups){
        var popular = be_vpn_util.get_popular_country({host: host,
            rule_ratings: rule_ratings});
        var proxy_country =
            (opt.country||popular[0].proxy_country||'').toLowerCase();
        // XXX arik: get url from rule and add url_from_root_url)
        var url = 'http://'+root_url+'/';
        var rules = be_rule.get('rules');
        var all_rules = be_vpn_util.get_all_rules({
            proxy_country: proxy_country, rules: rules, url: url,
            root_url: root_url, rule_ratings: rule_ratings, groups: groups});
        rule = all_rules[0];
    }, function set(){
        return E.script_set(rule, {enabled: enabled, root_url: root_url});
    }, function(){
        be_lib.perr_ok({id: 'be_enable_root_url', info:
            {name: rule.name, root_url: root_url, country: rule.country,
            src_country: (be_info.get('country')||'').toLowerCase(),
            hola_uid: be_ext.get('hola_uid')}});
        return rule; }]);
};

E.tpopup_is_connected = function(id, tpopup_type){
    if (!E.be_tpopup)
        return;
    return E.be_tpopup.is_connected(id, tpopup_type);
};

return E; });
