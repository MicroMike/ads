// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*//*global browser*/
define(['jquery', 'underscore', 'backbone', '/bext/pub/backbone.js',
    '/util/etask.js', '/bext/pub/util.js', '/bext/pub/tabs.js',
    '/bext/pub/ext.js', '/bext/pub/browser.js', '/svc/pub/util.js',
    '/util/escape.js', '/bext/pub/lib.js', '/util/url.js',
    '/bext/vpn/pub/tab_unblocker.js', '/bext/vpn/pub/info.js',
    '/bext/vpn/pub/rule.js', 'be_ver',
    '/util/zerr.js', '/util/storage.js', '/util/date.js',
    '/bext/vpn/pub/iframe.js', '/bext/vpn/pub/premium.js',
    '/util/util.js', '/bext/vpn/pub/util.js', '/bext/pub/locale.js',
    '/bext/vpn/pub/tpopup_main.js', '/util/version_util.js'],
    function($, _, Backbone, be_backbone, etask, be_util, be_tabs, be_ext,
    B, svc_util, zescape, be_lib, zurl, be_tab_unblocker, be_info, be_rule,
    be_ver, zerr, storage, date, be_iframe, premium, zutil, be_vpn_util, T,
    tpopup_main, version_util){
B.assert_bg('be_tpopup');
var chrome = window.chrome, conf = window.conf, zconf = window.zon_config;
var zopts = be_util.zopts;
var E = new (be_backbone.model.extend({
    _defaults: function(){
        this.on('destroy', function(){
            this.uninit();
        }.bind(this));
    },
}))();

function script_data(iframe_int, opt){
    // XXX pavlo: must be called to init $ in iframe.js
    iframe_int.init_jquery();
    // can't use window.browser
    var B = window.chrome || typeof browser!='undefined' && browser;
    var $frame, cid = opt.connection_id, port, self;
    var origin = opt.origin, inited = false;
    var _init = B ? chrome_init : firefox_init;
    var _uninit = B ? chrome_uninit : firefox_uninit;
    var set_frame_content = function(frame){
        frame.ready(function(){
            if (!opt.get_view)
                return;
            var view = new Function('return '+opt.get_view)()(frame, opt);
            var contents = frame.contents();
            view.init(contents, {ext_send_msg: ext_send_msg});
            if (view.draw)
                view.draw(contents);
        });
    };
    function add_iframe(){
        if (document.getElementById('_hola_popup_iframe__'))
            return void console.error('frame already exists');
        if (!document.body) // XXX bahaa: wait for it
            return void console.error('document not ready');
        var tpopup_html, top = '5px', body_click = true;
        switch (opt.type)
        {
        case 'site_trial_try':
        case 'site_trial_timer':
            body_click = false;
            // XXX sergeir: different margin per site
            top = '60px'; // to don't overlap Netflix "Sign In" button
            tpopup_html = 'site_trial.html';
            break;
        case 'trial_ended':
            body_click = false;
            tpopup_html = 'trial_ended.html';
            break;
        default: tpopup_html = 'tpopup.html';
        }
        var url = !opt.use_local && tpopup_html ? opt.base_url+'/'+tpopup_html+
            '?ver='+opt.ver : '';
        var f = iframe_int.add({url: url});
        // XXX arik/alexeym hack: need something better than just z-index
        // alexeym: 99999 because need to be undex MPlayer overlay (100000)
        var styles = {position: 'fixed', top: top, right: '20px',
            'background-color': 'transparent', 'z-index': 99999,
            overflow: 'hidden', visibility: 'hidden', border: 'none'};
        f.css(styles).attr('id', '_hola_popup_iframe__');
        if (body_click)
            document.body.addEventListener('mousedown', mousedown_cb);
        window.addEventListener('message', on_tab_msg, false);
        if (!url)
            set_frame_content(f);
        return f;
    }
    function rm_iframe(){
        try {
            if (!$frame)
                return;
            if (document.body)
                document.body.removeEventListener('mousedown', mousedown_cb);
            rm_msg_listener();
            $frame = null;
            iframe_int.remove();
        } catch(e){
            // in firefox when navigate to different page we get error:
            // "Permission denied to access property 'document'"
            console.error('rm_iframe error: '+e);
        }
    }
    function rm_msg_listener(forced){
        if (opt.persistent && !forced)
            return;
        window.removeEventListener('message', on_tab_msg, false);
    }
    function mousedown_cb(){
        if (!$frame)
            return;
        // XXX arik/bahaa hack: best solution is to ask ui_vpn to call
        // set_dont_show_again
        if (!opt.type)
        {
            ext_send_msg({type: 'be_msg_req', id: Math.random(),
                _type: 'tpopup', _tab_id: opt.tab_id, context: {rmt: true},
                msg: {msg: 'call_api', obj: 'tpopup',
                func: 'set_dont_show_again', args: [{tab_id: opt.tab_id,
                period: 'session', root_url: opt.root_url,
                src: 'ext_click'}]}});
        }
        // XXX arik/bahaa hack: need generic way to pass messages to tpopup
        iframe_int.send({id: 'cs_tpopup.hide_anim'});
        // XXX arik/alexeym hack: we set 500 to allow tpopup close animation
        // to finish
        setTimeout(uninit, 500);
    }
    function ext_send_msg(msg){
        if (B)
            return void B.runtime.sendMessage(msg);
        self.postMessage(msg);
    }
    function on_ext_msg(msg){
        if (!msg || msg._connection_id!=cid)
            return;
        iframe_int.send(msg, origin);
    }
    function on_tab_msg(e){
        var msg = e.data;
        if (msg && msg.id=='enable_root_url')
        {
            msg.no_resp = true;
            msg.opt = msg.opt||{};
            if (!msg.opt.root_url)
                msg.opt.root_url = opt.root_url;
            if (!msg.opt.country)
                msg.opt.country = 'US';
            ext_send_msg(msg);
            rm_msg_listener(true);
            return;
        }
        if (!msg || !$frame || !msg.id || !msg.id.startsWith('tpopup.') &&
            msg._type!='tpopup' && e.origin!=origin)
        {
            return;
        }
        switch (msg.id)
        {
        case 'tpopup.show': $frame.css('visibility', 'visible'); break;
        case 'tpopup.hide': $frame.css('visibility', 'hidden'); break;
        case 'tpopup.init':
            // XXX arik/bahaa: need to send opt as is to popup
            msg = {id: msg.id, conf: opt.conf, zon_config: opt.zon_config,
                ver: opt.ver, tab_id: opt.tab_id, root_url: opt.root_url,
                url: opt.url, type: opt.type, zopts: opt.zopts,
                browser_have: opt.browser_have};
            if (opt.screenshot)
                msg.screenshot = opt.screenshot;
            iframe_int.send(msg, origin);
            break;
        case 'tpopup.on_lang':
            if (!msg.locale)
                return;
            try { localStorage.setItem('locale', msg.locale);
            } catch(err){ return; }
            opt.locale = msg.locale;
            ext_send_msg({type: 'be_msg_req', id: Math.random(),
                _type: 'tpopup', _tab_id: opt.tab_id, context: {rmt: true},
                msg: {msg: 'call_api', obj: 'tpopup', func: 'on_lang_change',
                args: [opt.locale]}});
            uninit();
            init();
            break;
        case 'tpopup.resize':
            on_resize(msg);
            break;
        case 'tpopup.close': uninit(); break;
        default: // forward to extension
            msg._tab_id = opt.tab_id;
            msg._connection_id = cid;
            ext_send_msg(msg);
            break;
        }
    }
    function on_resize(msg){
        msg = msg||{};
        iframe_int.resize({width: msg.width, height: msg.height});
    }
    function init(){
        if (inited)
            return;
        // url might change between the time BG called tabs.executeScript and
        // this point (happens consistently on some sites)
        if (opt.url!=location.href)
        {
            console.error('expected url: '+opt.url+' actual: '+location.href);
            return;
        }
        inited = true;
        if (!($frame = add_iframe()))
            return;
        _init();
    }
    function uninit(){
        if (!inited)
            return;
        rm_iframe();
        _uninit();
        inited = false;
    }
    function on_disconnect(){
        uninit();
        rm_msg_listener(true);
    }
    function chrome_init(){
        port = B.runtime.connect({name: cid});
        B.runtime.onMessage.addListener(on_ext_msg);
        port.onDisconnect.addListener(on_disconnect);
    }
    function chrome_uninit(){
        B.runtime.onMessage.removeListener(on_ext_msg);
        port.onDisconnect.removeListener(on_disconnect);
        port = null;
    }
    function firefox_init(){
        self = window.self;
        self.on('message', on_ext_msg);
        self.on('detach', on_disconnect); // FF<30
        self.port.on('detach', on_disconnect); // FF>=30
    }
    function firefox_uninit(){
        self.removeListener('message', on_ext_msg);
        self.removeListener('detach', on_disconnect);
        self.port.removeListener('detach', on_disconnect);
        self = null;
    }
    init();
}

function _is_dont_show(tab_id, val, type){
    if (!val)
        return false;
    // XXX arik BACKWARD: < 1.3.265 didn't save user ts. need to fix db
    // entries and rm "||val.ts".
    var ts_diff = new Date() - date.from_sql(val.ts_user||val.ts);
    var is_type = val.type==type;
    if (val.period=='never')
        return is_type;
    if (val.period=='default')
        return is_type && ts_diff<date.ms.WEEK;
    var dur;
    if (dur = date.str_to_dur(val.period||'default'))
        return is_type && ts_diff<dur;
    var dont_show_tabs = be_info.get('dont_show_tabs')||{};
    var tab_data = dont_show_tabs[tab_id]||{};
    return tab_data.period=='session' && tab_data.type==type;
}

function is_dont_show(tab, root_url, type){
    var settings = be_info.get('settings');
    if (!settings||!settings.dont_show)
        return false;
    if (tab && tab.id && redirect_tabs[tab.id])
        return false;
    type = !type ? undefined : type;
    if (_is_dont_show(tab.id, settings.dont_show.all, type) ||
        _is_dont_show(tab.id, settings.dont_show[root_url], type))
    {
        return true;
    }
    return false;
}

function popup_showing(){
    if (chrome)
    {
        var views = chrome.extension.getViews({type: 'popup'});
        return views && views.length>0;
    }
    return B.have['firefox.panel.is_showing'] &&
        etask.cb_apply(B.firefox.panel, '.is_showing', []);
}

function is_disabled(){
    return !be_ext.get('r.ext.enabled');
}

// Minimum unblocking rate to suggest unblocking via tpopup
var min_suggest_rate=0.3;

var forced_urls = {}, connected_tpopups = {};
function is_connected(tab_id, tpopup_type){
    var tab_connected = B.tabs.is_connected(tab_id);
    return tab_connected && tpopup_type ?
        connected_tpopups[tab_id]==tpopup_type :
        tab_connected && connected_tpopups[tab_id];
}
E.is_connected = is_connected;

function get_tpopup_files(){
    if (!tpopup_main.inited)
        return;
    return etask({name: 'get_tpopup_files', cancel: true}, [function(){
        return be_ext.get('local_tpopup.enable_cache') &&
            be_lib.storage_local_get('tpopup_ver_json');
    }, function(tpopup_ver){
        tpopup_ver = (tpopup_ver||{}).tpopup_ver_json;
        if (tpopup_ver && tpopup_ver.ver)
            return be_lib.storage_local_get('tpopup_local_files');
    }, function(st_files){
        var files = {};
        st_files = (st_files||{}).tpopup_local_files||{};
        tpopup_main.files.forEach(function(f){
            files[f.name] = st_files[f.file]||tpopup_main[f.name];
        });
        return files;
    }]);
}

// XXX arik/alexeym: need to mv logic out and add a test
// injects tpopup into a page
// whether to inject tpopup into a page depends on the following conditions
// in different combinations:
// - regular/incognito tab
// - extension enabled/disabled
// - svc installed/doesn't exist
// - domain unblock rate in user's country
// - tpopup forced to be shown
// - trial available for domain
// - trial active for domain
// - global trial is ended
// - user chosen "don't show" in a tpopup for domain
// - website redirected user to another domain (e.g. bbc.co.uk->bbc.com)
// - website shown error
// - version up to date
function do_tpopup(tab, tpopup_opt){
    if (!tab || !tab.url || is_disabled())
        return;
    var rule, root_url, url = tab.url, id = tab.id;
    tpopup_opt = tpopup_opt||{};
    var tpopup_type, tpopup_files;
    return etask({name: 'do_tpopup', cancel: true}, [function(){
        root_url = svc_util.get_root_url(url);
        // XXX pavlo: bug, sometimes we think we still connected, while we are
        // not. Happens when you open regular popup, while tpopup is opened,
        // refresh the page and tpopup won't appear
        // fast path. rechecked before attach
        if (is_connected(id, tpopup_type) && !redirect_tabs[id])
            return this.return(zerr.notice('tab already attached'));
    }, function(){
        rule = premium.get_force_premium_rule(root_url);
        var is_test_trial = zutil.get(rule, 'test.name')=='trial';
        if (zutil.get(rule, 'blacklist'))
        {
            zerr.notice('rule is blacklist %s', root_url);
            return this.return();
        }
        // XXX arik: rm
        if (false &&
            (premium.is_uuid_trial_using(root_url) && (!is_test_trial ||
            is_test_trial && !is_dont_show(tab, root_url, 'test_trial'))))
        {
            tpopup_type = 'site_trial_timer';
            zerr.notice('trial active - tpopup should be shown');
            return this.goto('render');
        }
        // XXX arik: rm
        if (false &&
            (premium.is_trial_ended() &&
            !is_dont_show(tab, root_url, 'trial_ended') &&
            (be_ext.get('bext_config')||{}).show_trial_ended))
        {
            tpopup_type = 'trial_ended';
            zerr.notice('trial ended - tpopup should be shown');
            return this.goto('render');
        }
        if (!premium.is_active() &&
            !is_dont_show(tab, root_url, 'site_premium') &&
            !is_dont_show(tab, root_url, 'site_trial_try') &&
            !is_dont_show(tab, root_url) && rule && !(is_test_trial &&
            be_vpn_util.is_conf_allowed(rule.test.on3)))
        {
            zerr.notice('force premium - tpopup should be shown');
            return this.goto('check_ver');
        }
        if (be_info.is_force_tpopup(root_url))
        {
            forced_urls[root_url] = true;
            be_info.unset_force_tpopup(root_url);
            zerr.notice('popup was forced');
            return this.goto('check_ver');
        }
        if (is_dont_show(tab, root_url))
        {
            zerr.notice('tab is don\'t show');
            return this.return();
        }
        if (forced_urls[root_url])
        {
            zerr.notice('popup was forced2');
            return this.goto('check_ver');
        }
        zerr.notice('checking if site has high unblocking rate');
        // XXX arik: decide if to call with root_url and if to mv logic
        // to server-side
        return be_info.get_unblocking_rate(200);
    }, function(unblocking_rate){
        if (!unblocking_rate)
            return false;
        if (premium.get_force_premium_rule(root_url))
            return false;
        for (var i=0, r, rate; !rate && (r = unblocking_rate[i]); i++)
        {
            if (r.root_url==root_url && r.unblocking_rate>min_suggest_rate)
                rate = r;
        }
        return !!rate;
    }, function(unblock_by_rate){
        if (unblock_by_rate)
            return true;
        zerr.notice('unblock rate is low, check if unblock by redirect/error');
        return redirect_tabs[id] || (error_tabs[id] ? error_tabs[id].etask ||
            error_tabs[id].is_blocked : undefined);
    }, function(need_unblock){
        if (!need_unblock)
        {
            zerr.notice('skip tpopup, no unblock by redirect/error');
            return this.return();
        }
    }, function check_ver(){ return window.RMT.check_ver();
    }, function render(e){
        connected_tpopups[id] = tpopup_type ? tpopup_type : true;
        if (e && e.load_ver)
            return this.return(zerr('skip tpopup, load new ver'+e.load_ver));
        return popup_showing();
    }, function(showing){
        if (showing && !redirect_tabs[id])
            return this.return(zerr.notice('extension popup is opened'));
        return get_tpopup_files();
    }, function(files){
        tpopup_files = files;
        return be_tabs.get_tab(id);
    }, function(tab){
        // while we decide if need to insert tpopup, the tab can be removed,
        // replaced, changed url, already injected with tpopup
        if (!tab)
            return this.return(zerr('tpopup tab disappeared'));
        if (tab.url!=url && !(error_tabs[id] && error_tabs[id].redirect))
        {
            zerr('tpopup tab changed url '+url+' -> '+tab.url);
            return this.return();
        }
        if (is_connected(id, tpopup_type) && !redirect_tabs[id])
            return this.return(zerr.notice('tab already attached'));
        zerr.notice('applying tpopup to tab id %s', id);
        var base_url = zconf._RELEASE ? conf.url_bext_cdn4||conf.url_bext :
            conf.url_bext;
        var opt = {conf: conf, zon_config: zconf,
            base_url: base_url,
            tab_id: id, connection_id: id+':tpopup:'+_.random(0xffff),
            root_url: root_url, url: url, ver: be_ver.ver,
            origin: 'https://'+zurl.get_host(base_url),
            persistent: !!redirect_tabs[id], zopts: zopts.table,
            browser_have: B.have};
        if (tpopup_type)
            opt.type = tpopup_type;
        if (tpopup_files && (chrome||{}).runtime)
        {
            opt.get_view = tpopup_main.view.toString();
            opt.locale = storage.get('locale');
            opt.load_css_remote = be_ext.get('local_tpopup.load_css_remote');
            opt.inject_css = be_ext.get('local_tpopup.inject_css');
            (opt.files = tpopup_main.files).forEach(function(f){
                opt[f.name] = tpopup_files[f.name]; });
            opt.use_local = true;
            opt.ext_url = chrome.runtime.getURL('')+'js';
        }
        if (tpopup_opt.reason)
        {
            be_lib.perr_ok({id: 'be_tpopup_inject', info: {url: tab.url,
                reason: tpopup_opt.reason}});
        }
        etask([function(){
            if (redirect_tabs[id])
                delete redirect_tabs[id];
            zerr.notice('inject tpopup iframe');
            return be_iframe.inject(id, script_data, opt,
                chrome ? {} : {tpopup: 1, connection_id: opt.connection_id});
        }, function(){ zerr.notice('tpopup iframe injected');
        }]);
        return opt;
    }, function cancel$(){
        delete connected_tpopups[id];
        return this.return();
    }, function catch$(err){
        var ok = err.message=='OK';
        be_lib.perr_err({id: 'be_tpopup2_err', err: err,
            info: ok ? 'src_country: '+be_ver.country : null,
            filehead: ok ? zerr.log_tail() : '', rate_limit: true});
        delete connected_tpopups[id];
    }, function finally$(){
        if (error_tabs[id])
            delete error_tabs[id];
    }]);
}

function get_enabled_rule(root_url){
    var rules = be_rule.get_rules('http://'+root_url+'/');
    var r = rules && rules[0];
    return r && r.enabled ? r : undefined;
}

function tpopup_on_updated(o){
    do_tpopup(o.tab);
}

function tpopup_on_replaced(o){
    B.tabs.get(o.added, function(tab){
        do_tpopup(tab);
    });
}

function tpopup_on_error(o){
    if (!o || !o.id || is_disabled())
        return;
    var url;
    etask([function(){ return be_tabs.get_tab(o.id);
    }, function(tab){
        if (!tab)
            return this.return();
        url = tab.url;
        var root_url = svc_util.get_root_url(url);
        if (get_enabled_rule(root_url))
            return this.return();
        return check_gov_block(url, o.id);
    }, function(is_blocked){
        if (!is_blocked)
            return this.return();
        return be_tabs.get_tab(o.id);
    }, function(tab){
        if (!tab || tab.url!=url)
            return this.return();
        // alexeym: chrome doesn't allow to inject scripts for internal pages
        if (chrome && o.info && o.info.http_status_code==0)
            redirect_to_unblock(o.id);
        else
            do_tpopup(tab, {reason: 'gov_block'});
    }]);
}

var error_tabs = {};
function check_gov_block(url, tab_id){
    if (!url)
        return;
    if (error_tabs[tab_id] && error_tabs[tab_id].url==url)
        return;
    var keep_redirect = error_tabs[tab_id] && error_tabs[tab_id].redirect;
    error_tabs[tab_id] = {url: url};
    if (keep_redirect)
    {
        error_tabs[tab_id].redirect = keep_redirect;
        error_tabs[tab_id].is_blocked = true;
        return;
    }
    error_tabs[tab_id].etask = etask([function(){
        return be_tab_unblocker.check_gov_blocking(url);
    }, function(is_blocked){
        if (is_blocked===undefined)
            return this.return();
        var tab_url = be_tabs.get_url(tab_id);
        if (is_blocked && tab_url==url)
            return be_tabs.get_tab(tab_id);
        return this.return(is_blocked);
    }, function(tab){
        if (!error_tabs[tab_id])
        {
            if (tab && tab.url==url)
                error_tabs[tab_id] = {url: url};
            else
                return;
        }
        error_tabs[tab_id].is_blocked = true;
        delete error_tabs[tab_id].etask;
        return true;
    }]);
    return error_tabs[tab_id].etask;
}

var redirect_tabs = {};
function redirect_to_unblock(tab_id){
    if (!chrome)
        return;
    etask([function(){ return be_tabs.get_tab(tab_id);
    }, function(tab){
        if (!tab||!tab.url)
            return this.return();
        var tab_url = tab.url;
        if (!be_tab_unblocker.is_vpn_allowed(tab_url, true))
            return this.return();
        tab_url = svc_util.get_root_url(tab_url);
        if (!tab_url)
            return this.return();
        if (get_enabled_rule(tab_url))
            return this.return();
        be_lib.perr_ok({id: 'be_tpopup_rewrite', info: {url: tab.url,
            reason: 'http_code_0'}});
        be_tab_unblocker.rewrite_to_proxy(tab.url, tab_id);
        redirect_tabs[tab_id] = true;
    }]);
}

E.uninit = function(){
    if (!E.inited)
        return;
    E.inited = 0;
    E.sp.return();
    E.stopListening();
};

E.init = function(){
    if (E.inited)
        return;
    E.inited = 1;
    E.sp = etask('be_tpopup', [function(){ return this.wait(); }]);
    if (!B.have.tpopup)
        return;
    try { E.tpopup_user = storage.get_json('tpopup_user')||{}; }
    catch(e){ E.tpopup_user = {}; }
    if (E.tpopup_user=='false') /* old fmt */
        E.tpopup_user = {};
    E.listenTo(be_tabs, 'updated', tpopup_on_updated);
    E.listenTo(be_tabs, 'replaced', tpopup_on_replaced);
    E.listenTo(be_tabs, 'error_occured', tpopup_on_error);
    try {
        if (version_util.cmp(be_util.version(), '1.116.934')>=0)
            tpopup_main.init();
    } catch(e){}
};

return E; });
