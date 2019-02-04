// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', '/bext/pub/backbone.js', '/util/etask.js',
    '/bext/pub/util.js', '/util/zerr.js', '/bext/pub/browser.js',
    '/bext/pub/lib.js', '/util/escape.js', '/util/version_util.js',
    'config', 'bootstrap', '/util/storage.js', '/util/ajax.js',
    '/bext/vpn/pub/tpopup_main.js', '/util/util.js', '/util/sprintf.js',
    'jquery_cookie'],
    function($, _, be_backbone, etask, be_util, zerr, B, be_lib, zescape,
    version_util, be_config, bootstrap, storage, ajax, tpopup_main, zutil,
    sprintf){
B.assert_bg('be_bg_main');
zerr.set_exception_handler('be', be_lib.err);
var chrome = window.chrome, conf = window.conf, zon_config = window.zon_config;
var assign = Object.assign;
var browser = be_util.browser();

var E = new (be_backbone.model.extend({
    _defaults: function(){
	this.on('install', on_install);
	this.on('update', on_update);
	this.on('up', on_up);
	this.on('destroy', function(){ E.uninit(); });
    },
}))();

E.be_util = be_util;
E.zerr = window.hola.zerr = zerr;
E.be_browser = B;
E.be_lib = be_lib;

function on_install(){
    storage.set('install_ts', window.hola.t.l_start);
    storage.set('install_version', be_util.version());
    E.set('ext.first_run', true);
    be_lib.ok('install');
}
function on_update(prev){ be_lib.ok('update', prev+' > '+be_util.version()); }
function on_up(){
    be_lib.ok('up');
    if (chrome)
        return;
    etask([function(){ return be_lib.storage_local_get({be_disabled: false});
    }, function(ret){
        if (!ret.be_disabled)
            return;
	be_lib.ok(be_util.is_plugin() ? 'be_plugin_enable' : 'be_ext_enable');
        return be_lib.storage_local_remove('be_disabled');
    }, function catch$(err){ zerr('on_up err: '+err); }]);
}

function ccgi_resp(msg, sender){
    _.defer(B.be.ccgi.send, msg, sender);
    return true;
}

function ccgi_ipc_handler(msg, sender){
    if (msg.id!='ping')
	return;
    msg.data = {
	uuid: E.get('uuid'),
	session_key: E.get('session_key')||0,
	ver: be_util.version(),
	type: conf.type,
	cid: E.get('svc.cid'),
	browser: E.get('browser'),
        plugin: E.get('mode')=='dll',
        build_info: {browser_build: window.conf.browser.name}
    };
    return ccgi_resp(msg, sender);
}

function ccgi_init(){
    B.be.ccgi.add_listener(ccgi_ipc_handler);
    if (!chrome)
        return;
    // attach to existing hola tabs
    B.tabs.query({url: conf.hola_match}, function(tabs){
        _.each(tabs, function(tab){
            B.tabs.execute_script(tab.id, {file: '/js/bext/vpn/pub/cs_hola.js',
                runAt: 'document_start'});
        });
    });
}

function ccgi_uninit(){ B.be.ccgi.del_listener(ccgi_ipc_handler); }

E.on_ccgi_url_change = _.debounce(function(){
    var qs = {browser: E.get('browser'), ver: be_util.version(),
        plugin: +(E.get('mode')=='dll')||undefined, uuid: E.get('uuid')};
    var ccgi_url_new = 'https://hola.org/access/my/settings'
        +'?utm_source=holaext&'+zescape.qs(qs);
    E.set('ccgi_url', ccgi_url_new);
});

function get_uuid(){
    return etask({name: 'get_uuid', cancel: true}, [function(){
        return etask.all({allow_fail: true}, {
            sync: chrome && B.have['storage.sync'] &&
                be_lib.storage_sync_get('uuid'),
            local: be_lib.storage_local_get('uuid'),
            localStorage:
                etask([function(){ return localStorage.getItem('uuid'); }]),
            cookie: etask([function(){ return $.cookie('uuid'); }]),
            ccgi: !chrome && etask.cb_apply(B.cookies, '.get',
                [{url: conf.url_ccgi, name: 'uuid'}]),
        });
    }, function(ret){
        get_uuid.last_error = collect_errors(ret);
        var uuid = ret.local && ret.local.uuid || ret.localStorage ||
            ret.cookie || ret.ccgi && ret.ccgi.value;
        return ensure_uniq_uuid(ret.sync && ret.sync.uuid, uuid);
    }, function catch$(err){
        be_lib.perr_err({id: 'unreachable', info: 'get_uuid', err: err});
    }]);
}

// versions < 1.6.644 used to save uuid in chrome.storage.sync so signed-in
// users would have same uuid on all their devices.
// this is meant to generate new uuid in these cases
function ensure_uniq_uuid(syncd, uuid){
    if (!syncd) // nothing syncd, no problem
        return uuid;
    if (!uuid)
    {
        // there is a syncd uuid that is not stored locally, so we generate a
        // new one
        E.set('sync_uuid', syncd);
        return null;
    }
    if (syncd!=uuid) // we already broke conflict
        return uuid;
    return etask({name: 'ensure_uniq_uuid', cancel: true}, [function(){
        return etask.all({allow_fail: true}, {
            sync: B.have['storage.sync'] && be_lib.storage_sync_get('uuid2'),
            local: be_lib.storage_local_get('uuid2'),
            localStorage:
                etask([function(){ return localStorage.getItem('uuid2'); }]),
            gen: E.gen_uuid(),
        });
    }, function(ret){
        var uuid2 = ret.local && ret.local.uuid2 || ret.localStorage ||
            ret.gen;
        var syncd2 = ret.sync && ret.sync.uuid2;
        if (syncd2==uuid2) // we already own the syncd uuid
            return uuid;
        persist_uuid2(uuid2);
        if (!syncd2) // syncd uuid is not taken, so we take ownership
        {
            if (!B.have['storage.sync'])
                be_lib.storage_local_set({uuid2: uuid2});
            else
                be_lib.storage_sync_set({uuid2: uuid2});
            be_lib.perr_ok({id: 'own_sync_uuid'});
            return uuid;
        }
        be_lib.perr_ok({id: 'owned_sync_uuid'});
        // syncd uuid is already taken so we need to generate new one
        E.set('sync_uuid', uuid);
        return null;
    }]);
}

function persist_uuid(uuid){
    return etask({name: 'persist_uuid'}, [function(){
        return etask.all({allow_fail: true}, {
            local: be_lib.storage_local_set({uuid: uuid}),
            localStorage:
                etask([function(){ localStorage.setItem('uuid', uuid); }]),
            cookie: etask([function(){
                $.cookie('uuid', uuid, {expires: 365, path: '/'}); }]),
        });
    }, function(ret){
        persist_uuid.last_error = collect_errors(ret);
        return _.isEmpty(ret);
    }, function catch$(err){
        be_lib.perr_err({id: 'unreachable', info: 'persist_uuid', err: err});
    }]);
}

function persist_uuid2(uuid2){
    return etask.all({allow_fail: true}, {
        local: be_lib.storage_local_set({uuid2: uuid2}),
        localStorage:
            etask([function(){ localStorage.setItem('uuid2', uuid2); }]),
    });
}

function collect_errors(ret){
    var arr = [];
    _.each(ret, function(v, k){
        if (!etask.is_err(v))
            return;
        delete ret[k];
        var e = {};
        e[k] = ''+v.error;
        arr.push(e);
    });
    return arr;
}

E.gen_uuid = function(){
    if (!window.crypto || !window.crypto.getRandomValues)
    {
        // FF v<21 missing this function, we use uuid generated by addon
        return etask.cb_apply(B.be, '.gen_uuid', []);
    }
    var buf = new Uint8Array(16), uuid = '';
    window.crypto.getRandomValues(buf);
    for (var i=0; i<buf.length; i++)
        uuid += (buf[i]<=0xf ? '0' : '')+buf[i].toString(16);
    return uuid;
};

function ensure_uuid(){
    var uuid;
    return etask({name: 'ensure_uuid', cancel: true}, [function(){
	return get_uuid();
    }, function(_uuid){
        if (_uuid)
        {
            E.sp.spawn(persist_uuid(_uuid));
            return this.return(_uuid);
        }
        E.set('new_uuid', true);
        return E.gen_uuid();
    }, function(_uuid){
        zerr.assert(_uuid, 'gen_uuid() returned: '+_uuid);
        return persist_uuid(uuid = _uuid);
    }, function(ret){
        if (!ret)
            return uuid;
        // could not persist a new uuid, consider it temporary
        uuid = 't.'+uuid.substr(2);
        be_lib.perr_err({id: 'init_tmp_uuid'}); // XXX bahaa: info
        return uuid;
    }]);
}

function handle_install(){
    return etask({name: 'handle_install', cancel: true}, [function(){
        return etask.cb_apply(B.runtime, '.get_install_details', []);
    }, function(details){
        var reason = details&&details.reason;
        zerr.notice('be_bg_main up reason: '+reason);
        if (E.get('new_uuid') && reason!='install')
            be_lib.perr_err({id: 'switch_uuid_err'}); // XXX bahaa: info
        if (E.get('sync_uuid'))
        {
            be_lib.perr_err({id: 'switch_sync_uuid',
                info: {uuid: E.get('sync_uuid'), reason: reason}});
        }
        if (!{install: 1, update: 1}[reason])
            return;
        E.set('install_details', reason); // XXX bahaa: actually install_reason
        E.trigger(reason, storage.get('ver'));
        storage.set('ver', be_util.version());
    }, function catch$(err){
        be_lib.perr_err({id: 'handle_install_err', err: err});
    }]);
}

E.uninstall_url_cb = function(){
    var url = conf.url_ccgi+'/uninstall?'+zescape.qs({perr: 1,
	uuid: E.get('uuid'), cid: E.get('svc.cid'), browser: E.get('browser'),
        version: be_util.version(), plugin: +!!be_util.is_plugin()});
    url = url.substr(0, 255); /* max uninstall url is 255 chars */
    B.runtime.set_uninstall_url(url);
};

// XXX colin: change all etask to have name and cancel if possible
E.init = function(){
    if (E.inited)
	return;
    if (['chrome', 'firefox', 'opera'].includes(browser))
        window.is_local_ccgi = true;
    E.set_perr(function(opt){ be_lib.perr_err(opt); });
    E.inited = true;
    E.sp = etask('be_bg_main', [function(){ return this.wait(); }]);
    /* XXX arik: rm all unload from the code, instead listen to
     * change:reload */
    $(window).on('unload', function(){ E._destroy(); });
    B.init();
    ccgi_init();
    B.backbone.server.start(E, 'be_bg_main');
    storage.clr('ajax_timeout');
    if (storage.get('ext_slave'))
    {
	E.set('ext.slave', true);
        storage.clr('ext_slave');
    }
    zerr.notice('be_bg_main_init');
    E.on('change:inited', inited_cb);
    E.on_init('change:ext.slave', E.on_slave_change);
    E.set('browser', browser);
    E.on_init('change:browser change:uuid change:mode', E.on_ccgi_url_change);
    if (B.have['runtime.set_uninstall_url'])
        E.on_init('change:uuid change:cid change:browser', E.uninstall_url_cb);
    E.on('change:local_tpopup.ts', E.update_tpopup_cache);
    E.sp.spawn(etask([function(){ return ensure_uuid();
    }, function(uuid){
        zerr.notice('uuid: '+uuid);
        E.set('uuid', uuid);
        return handle_install();
    }, function(e){
	E.trigger('up');
	E.set('inited', true);
    }, function catch$(err){ be_lib.err('init_err', null, err);
    }, function finally$(){
        var get = get_uuid.last_error||[];
        var set = persist_uuid.last_error||[];
        if (!get.length && !set.length)
            return;
        be_lib.perr_err({id: 'uuid_storage_err',
            info: zerr.json({get: get, set: set})});
    }]));
};

E.uninit = function(){
    if (!E.inited)
	return;
    E.sp.return();
    B.backbone.server.stop('be_bg_main');
    ccgi_uninit();
    B._destroy();
    E.inited = false;
};

var icon = {
    gray: {19: 'bext/vpn/pub/img/icon19_gray.png',
        38: 'bext/vpn/pub/img/icon38_gray.png'},
    blank: {19: 'bext/vpn/pub/img/icon19_blank.png',
        38: 'bext/vpn/pub/img/icon38_blank.png'},
};
if (version_util.cmp(be_util.version(), '1.13.544')<0)
{
    icon = {
        gray: {19: 'img/icon19_gray.png', 38: 'img/icon38_gray.png'},
        blank: {19: 'img/icon19_blank.png', 38: 'img/icon38_blank.png'},
    };
}
E.on_slave_change = function(){
    try {
        var slave = E.get('ext.slave');
        B.browser_action[slave ? 'disable' : 'enable']();
        B.browser_action.set_popup(
            {popup: slave ? '' : conf.default_popup});
        if (slave || !E.get('popup.disable_icon'))
        {
            B.browser_action.set_icon(
                {path: icon[slave ? 'blank' : 'gray']});
            if (slave)
                B.browser_action.set_title({title: ''});
        }
    } catch(e){
        be_lib.perr_err({id: 'set_icon_err', rate_limit: {count: 1}}, e); }
};

function inited_cb(){
    if (!E.get('inited'))
	return;
    E.off('change:inited', inited_cb);
    etask([function(){ return storage.get('ext_state');
    }, function(state){ E.set('enabled', state!='disabled');
    }, function(){ return E.load_rmt();
    }, function catch$(err){ be_lib.err('be_bg_main_init_err', '', err); }]);
}

E.ok = function(id, info){ return be_lib.ok(id, info); };
E.err = function(id, info, err){ return be_lib.err(id, info, err); };

E.set_enabled = function(on){
    if (!!E.get('enabled')==!!on)
	return;
    return etask([function(){
	E.set('enabled', !!on);
        return storage.set('ext_state', on ? 'enabled' : 'disabled');
    }, function catch$(err){
	be_lib.err('be_bg_main_set_enable_err', null, err);
    }]);
};

function load_config(be_ver){
    define('be_ver', function(){ return be_ver; });
    require.config({baseUrl: conf.url_bext, waitSeconds: 30,
        urlArgs: 'ext_ver='+be_util.version()+'&ver='+be_ver.ver});
    require(['config'], function(_be_config){
        _be_config.init(be_ver.ver, be_ver.country);
        require(['/bext/vpn/pub/rmt_ext.js'], function(be_rmt){
            if (E.get('rmt_loaded'))
                return;
            E.set('rmt_loaded', true);
            window.RMT = be_rmt;
            window.RMT.init();
        });
    });
}

// XXX arik: review
E.load_local = function(){
    var be_ver = {ver: zon_config.ZON_VERSION};
    be_config.undef();
    define('be_ver', function(){ return be_ver; });
    require(['config'], function(_be_config){
        _be_config.init(be_ver.ver);
        require(['/bext/vpn/pub/rmt_ext.js'], function(be_rmt){
            if (E.get('rmt_loaded'))
                return;
            E.set('rmt_loaded', true);
            window.RMT = be_rmt;
            window.RMT.init();
        });
    });
};

// XXX arik: renam to load_ccgi
E.load_rmt = function(){
    if (!E.get('inited') || E.get('rmt_loaded'))
	return;
    if (window.is_local_ccgi)
        return E.load_local();
    be_config.undef();
    // XXX arik: rename is_remote to is_ccgi
    window.require_is_remote = true; /* XXX arik hack: find better way */
    var be_ver = storage.get_json('be_ver_json');
    var on_ver_load;
    var no_cache_require = require.config({context: 'no_cache',
        baseUrl: conf.url_bext, waitSeconds: 30,
        urlArgs: 'ext_ver='+be_util.version()+'&rand='+Math.random()});
    // XXX alexeym: replace with ajax request
    no_cache_require.undef('be_ver');
    no_cache_require(['be_ver'], function(_be_ver){
        storage.set_json('be_ver_json', _be_ver);
        if (be_ver && be_ver.ver!=_be_ver.ver)
            return void be_lib.reload_ext();
        be_ver = _be_ver;
        if (on_ver_load)
            on_ver_load(be_ver);
    });
    if (be_ver)
        return void load_config(be_ver);
    on_ver_load = load_config;
};

function clear_tpopup_cache(){
    be_lib.storage_local_remove('tpopup_local_files');
    be_lib.storage_local_remove('tpopup_ver_json');
}

var is_cache_loading, update_cache_to;
E.update_tpopup_cache = function(){
    if (is_cache_loading)
        return;
    if (E.get('local_tpopup.clear_cache'))
        clear_tpopup_cache();
    if (!E.get('local_tpopup.enable_cache') || !E.get('inited'))
	return;
    var be_ver, qs = {rand: Math.random(), ext_ver: be_util.version()};
    if (update_cache_to)
        update_cache_to = clearTimeout(update_cache_to);
    is_cache_loading = true;
    return etask([function(){
        return be_lib.storage_local_get('tpopup_ver_json');
    }, function(ver){
        be_ver = (ver||{}).tpopup_ver_json;
        return ajax.json({url: conf.url_ccgi+'/ver.json', qs: qs});
    }, function(ret){
        if (!ret || !ret.ver)
        {
            be_lib.perr_err({id: 'be_ver_not_found'});
            return this.return();
        }
        if (be_ver && be_ver.ver==ret.ver)
            return this.return();
        var files = ret.files || tpopup_main.files;
        var base = zon_config._RELEASE ? conf.url_bext_cdn4 ||
            conf.url_bext : conf.url_bext;
        var load = {};
        files.forEach(function(f){
            if (f.ignore)
                return;
            load[f.file] = ajax({url: ret.files ? f.url : base+f.path+f.file,
                qs: assign({}, qs, f.qs)});
        });
        be_ver = ret;
        return etask.all({}, load);
    }, function(ret){
        var keys;
        if (!ret || !(keys = Object.keys(ret)).length)
            return be_lib.perr_err({id: 'update_tpopup_all_failed'});
        if (keys.some(function(f){ return !ret[f]; }))
            return be_lib.perr_err({id: 'update_tpopup_file_failed'});
        try {
            be_lib.storage_local_set({tpopup_local_files: ret});
            be_lib.storage_local_set({tpopup_ver_json: be_ver});
            be_lib.perr_ok({id: 'update_tpopup_cache_done'});
        } catch(e){
            be_lib.perr_err({id: 'update_tpopup_storage_failed', err: e});
            clear_tpopup_cache();
        }
    }, function catch$(e){
        be_lib.perr_err({id: 'update_tpopup_cache_err', err: e});
    }, function finally$(){
        is_cache_loading = false;
        update_cache_to = setTimeout(E.update_tpopup_cache,
            E.get('local_tpopup.period'));
    }]);
};

E.get_rmt_config = function(){
    return zutil.get(window.RMT, 'be_config.config'); };

var dumped_log = [];
E.dump_log = function(log){
    dumped_log = dumped_log.concat(log||[]).slice(-zerr.log.max_size); };

E.get_log = function(ui_log){
    var skips = [/backbone\.\w+\./, /ajax.*(perr| url )/,
        /perr.*rate too high/, /connection.*tpopup:[0-9]+/,
        /be_tab_unblocker.*chrome-extension/, /stop .*cws/,
        /: (tab:[\d-]+ )?[a-z.]*popup /, /fetch_rules/];
    var formats = [{from: /(perr \w+) .*$/, to: '$1'}];
    var format = function(line){
        var ret = line;
        formats.forEach(function(f){ ret = ret.replace(f.from, f.to); });
        return ret;
    };
    var map = function(from, line){
        if (!/]$/.test(line))
            return {from: from, line: format(line)};
        var cnt = 0;
        var args_len = line.split('').reverse().findIndex(function(c){
            return (cnt += c==']' ? 1 : c=='[' ? -1 : 0)==0; });
        if (args_len==-1)
            return {from: from, line: format(line)};
        args_len++;
        var fmt = line.slice(0, -args_len);
        var args = JSON.parse(line.slice(-args_len));
        line = sprintf.apply(null, [fmt].concat(args));
        return {from: from, line: format(line)};
    };
    var bg_log = zerr.log.concat(zutil.get(window.RMT, 'zerr.log', []));
    return (ui_log||[]).concat(dumped_log||[]).map(map.bind(null, 'ui'))
    .concat((bg_log||[]).map(map.bind(null, 'bg')))
    .filter(function(c){
        return !skips.find(function(s){ return s.test(c.line); }); })
    .sort(function(a, b){ return a.line.localeCompare(b.line); })
    .map(function(c){ return '['+c.from+'] '+c.line; });
};

E.set_bug_id = function(bug_id){
    zerr.warn('VPN BUG REPORT: http://web.hola.org/vpn_debug?id='+bug_id); };

var F = E.flags = {
    DEV: 0x40,
    REL1: 0x80,
    NO_UPDATE: 0x200,
    TMP_UUID: 0x400,
    PLUGIN: 0x8000,
    TORCH: 0x20000,
    APK_ANDROID: 0x40000,
};
function lset(bits, logic){ return logic ? bits : 0; }

E.get_flags = function(){
    var manifest = chrome && B.runtime.manifest;
    return lset(F.PLUGIN, E.get('plugin.enabled') || be_util.is_plugin())|
	lset(F.TMP_UUID, (E.get('uuid')||'').startsWith('t.'))|
        lset(F.TORCH, E.get('browser')=='torch')|
        lset(F.DEV,
            !zon_config._RELEASE)|lset(F.REL1, zon_config._RELEASE_LEVEL==1)|
        lset(F.NO_UPDATE, manifest && !manifest.update_url);
};

return E; });
