// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', 'backbone', '/bext/pub/backbone.js',
    '/util/etask.js', '/bext/pub/ext.js', '/bext/pub/util.js', '/util/util.js',
    '/util/zerr.js', '/bext/vpn/pub/rule.js', '/bext/pub/browser.js',
    '/bext/pub/lib.js', '/util/date.js', '/bext/vpn/pub/ajax.js',
    '/util/storage.js', '/bext/vpn/pub/features.js', '/bext/vpn/pub/svc.js',
    '/bext/vpn/pub/mode.js', '/svc/hola/pub/svc_ipc.js'],
    function($, _, Backbone, be_backbone, etask, be_ext, be_util, zutil, zerr,
    be_rule, B, be_lib, date, ajax, storage, be_features, be_svc, be_mode,
    svc_ipc){
B.assert_bg('be_info');
var conf = window.conf;
var E = new (be_backbone.task_model.extend({
    _defaults: function(){
        this.on('destroy', function(){
            B.backbone.server.stop('be_info');
            uninit();
        });
        B.backbone.server.start(this, 'be_info');
    },
}))();

E.init = function(rmt){
    if (E.get('inited'))
        return;
    E.rmt = rmt;
    E.set('inited', true);
    E.set('vpn_work_yes', storage.get_int('vpn_work_yes'));
    E.set('vpn_last_rating', storage.get_int('vpn_last_rating'));
    E.set('rate_on_store', storage.get_int('rate_on_store'));
    E.sp = etask('be_info', [function(){ return this.wait(); }]);
    E.on('recover', E.fetch_info);
    E.on('change:location', _.debounce(function(){
        var location = E.get('location');
        E.set('country', location ? location.country : null);
        storage.set('src_country', E.get('country'));
    }));
    be_ext.on_init('change:r.vpn.on change:uuid', E.fetch_info);
    be_ext.on_init('change:session_key', E.set_cid);
    be_mode.on_init('change:svc.cid', E.set_cid);
    be_ext.on_init('change:session_key', E.set_sync_uuid);
    be_ext.on_init('change:user_id', E.set_user_id);
};

function uninit(){
    if (!E.get('inited'))
        return;
    E.sp.return();
    be_ext.off('change:r.vpn.on change:uuid', E.fetch_info);
    be_mode.off('change:svc.cid', E.set_cid);
    be_ext.off('change:session_key', E.set_cid);
    be_ext.off('change:session_key', E.set_sync_uuid);
    be_ext.off('change:user_id', E.set_user_id);
}

E.epopup_new = function(root_url){
    return etask([function(){ zerr.notice('epopup_new');
    }, function(){
        var src_country_fake = storage.get('src_country_fake');
        return ajax.json({url: conf.url_ccgi+'/popup_new.json',
            qs: be_ext.auth(), data: {src_country_fake: src_country_fake,
            root_url: root_url}, slow: 500});
    }, function(info){
        E.set('location', info.req);
        storage.set_json('location', info.req);
        return info;
    }, function catch$(err){
        be_lib.err('be_info_epopup_new_err', '', err);
        throw err;
    }]);
};

E.get_unblocking_rate = function(limit){
    var country = (E.get('country')||'').toLowerCase();
    if (!country)
        return;
    var n = 0;
    return etask({name: 'get_unblocker_rate', cancel: true}, [function start(){
        n++;
    }, function try_catch$(){
        // XXX arik/derry: 20% of the requests succeed after a failure.
        // ~75% of the failures are with http and https succeed
        // (probaby some kind of adblocker/spam filter
        var url = conf.url_ccgi+'/unblocking_rate';
        if (n>1)
            url = url.replace('http://', 'https://');
        return ajax.json({url: url,
            data: be_ext.qs_ajax({src_country: country, limit: limit})});
    }, function(e){
        if (this.error)
        {
            if (n>1)
                throw this.error;
            return this.goto('start');
        }
        if (be_features.have(be_ext, 'rule_rating_control'))
            be_lib.perr_err({id: 'be_unblocking_rate_ok', info: {n: n}});
        return e;
    }, function catch$(err){
        be_lib.perr_err({id: 'be_unblocking_rate_err', err: err});
    }]);
};

E.efetch_info = function(){
    return etask({name: 'efetch_info', cancel: true}, [function(){
        zerr.notice('be_info: fetch_info');
    }, function(){ /* XXX arik: rename popup_new.json to vpn_info */
        var src_country_fake = storage.get('src_country_fake');
        return ajax.json({url: conf.url_ccgi+'/fetch_info',
            qs: be_ext.auth(), retry: 1,
               data: {src_country_fake: src_country_fake, settings: 1}});
    }, function(info){
        if (!window.is_local_ccgi && info.ver!=E.rmt.ver)
        {
            E.rmt.load_new_ver(info.ver);
            throw new Error('load_new_ver');
        }
        E.set('location', info.req);
        storage.set_json('location', info.req);
        E.set('settings', info.settings);
    }, function catch$(err){
        be_lib.err('be_info_fetch_info_err', '', err);
        throw err;
    }]);
};
E.fetch_info = function(){ E.trigger('fetch_info'); };
E.on('fetch_info', function(){
    if (!E.set_busy({desc: 'Configuring...'}))
        return E.schedule_clr(['fetch_info']);
    return E.sp.spawn(etask({name: 'fetch_info', cancel: true}, [function(){
        return E.efetch_info();
    }, function(){ E.clr_busy();
    }, function catch$(err){
        E.set_err();
        be_lib.err('be_info_on_fetch_info_err', '', err);
    }]));
});

var cids = [];
if (window.hola)
    cids = window.hola.cids||(window.hola.cids = []);
E.set_cid = function(){ E.trigger('set_cid'); };
E.on('set_cid', function(){
    return E.sp.spawn(etask({name: 'set_cid'}, [function(){
        var cid = +be_mode.get('svc.cid')||0, key = be_ext.get('session_key'),
            uuid = be_ext.get('uuid');
        if (!key || !(cid>0) || _.contains(cids, cid))
            return this.return();
        cids.push(cid);
        return ajax.json({timeout: 20000, data: {session_key: key},
            url: conf.url_ccgi+'/set_cid?uuid='+uuid+'&browser='
            +be_ext.get('browser')+'&ver='+be_util.version()+'&cid='+cid,
            method: 'POST'});
    }, function catch$(err){ be_lib.err('be_info_set_cid_err', '', err); }]));
});

E.set_sync_uuid = function(){
    var key = be_ext.get('session_key'), uuid = be_ext.get('uuid');
    if (!key)
        return;
    E.sp.spawn(etask({name: 'set_sync_uuid'}, [function(){
        if (!B.have['storage.sync'])
            return be_lib.storage_local_get('uuid');
        return be_lib.storage_sync_get('uuid');
    }, function(ret){
        var sync_uuid = ret && ret.uuid;
        if (!sync_uuid || sync_uuid==uuid)
            return;
        ajax.json({timeout: 20000, data: {session_key: key}, method: 'POST',
            url: conf.url_ccgi+'/set_sync_uuid?uuid='+uuid
            +'&browser='+be_ext.get('browser')+'&ver='+be_util.version()
            +'&sync_uuid='+sync_uuid});
    }]));
};

E.set_user_id = function(){ E.trigger('set_user_id'); };
E.on('set_user_id', function(){
    return etask([function(){
        var user_id = be_ext.get('user_id');
        var is_premium = be_ext.get('is_premium');
        if (!user_id)
            return this.return();
        return etask.all({allow_fail: true}, {
            client: ajax.json({qs: be_ext.auth(), method: 'POST',
                url: conf.url_ccgi+'/set_user_client.json',
                data: {user_id: user_id}}),
            svc: svc_ipc.ajax({cmd: 'user_token_update.json?token='+user_id+
                (is_premium ? '&premium' : '')}),
        });
    }, function(){ E.trigger('user_id_set'); },
    function catch$(err){ be_lib.err('be_info_set_user_id_err', '', err);
    }]);
});

E.set_dont_show_again = function(opt){
    opt = zutil.clone(opt);
    return etask({name: 'set_dont_show_again', cancel: true}, [function(){
        var tabs = E.get('dont_show_tabs')||{};
        var tab = tabs[''+opt.tab_id] = tabs[''+opt.tab_id]||{};
        tab.n = (tab.n||0)+1;
        if (opt.period=='session')
        {
            // if user closed tpopup 3 times, don't show again for tab session
            if (tab.n < 3)
            {
                E.set('dont_show_tabs', tabs);
                return;
            }
            tab.period = 'session';
        }
        if (opt.type)
            tab.type = opt.type;
        E.set('dont_show_tabs', tabs);
        opt.ts_user = opt.ts_user||date.to_sql(new Date());
        return ajax.json({url: conf.url_ccgi+'/set_dont_show_again',
            qs: be_ext.auth(), data: opt, method: 'POST'});
    }, function(){ return E.efetch_info();
    }, function(){
        be_lib.perr_ok({id: 'be_set_dont_show_again', info: opt});
    }, function catch$(err){
        be_lib.perr_err({id: 'be_set_dont_show_again_err', err: err});
    }]);
};

E.trial_subscribe = function(opt){
    B.tabs.update(opt.tab_id, {url: 'https://hola.org/plus?ref='+
        'holaext-test-trial-'+opt.root_url, active: true});
};

E.set_force_tpopup = function(root_url){
    var force = E.get('force_tpopup')||storage.get_json('force_tpopup')||{};
    force[root_url] = {ts: date.to_sql(new Date())};
    E.set('force_tpopup', force);
    storage.set_json('force_tpopup', force);
};

E.unset_force_tpopup = function(root_url){
    var force = E.get('force_tpopup')||storage.get_json('force_tpopup')||{};
    delete force[root_url];
    E.set('force_tpopup', force);
    storage.set_json('force_tpopup', force);
};

E.is_force_tpopup = function(root_url){
    var force = E.get('force_tpopup')||storage.get_json('force_tpopup')||{};
    if (!force||!force[root_url])
        return false;
    var _ts = force[root_url].ts;
    if (!_ts)
        return false;
    var ts = date.from_sql(_ts);
    return Date.now()-ts < 30*date.ms.MIN;
};

E.increment_vpn_work_yes = function(){
    var counter = E.get('vpn_work_yes') + 1;
    storage.set('vpn_work_yes', counter);
    E.set('vpn_work_yes', counter);
};

E.set_vpn_last_rating = function(rating){
    storage.set('vpn_last_rating', rating);
    E.set('vpn_last_rating', rating);
};

E.set_rate_on_store = function(ts){
    storage.set('rate_on_store', ts);
    E.set('rate_on_store', ts);
};

// XXX arik: reuse www/pub/unblock_util.js:E.rule_unblock_url
E.get_unblock_url = function(domain, country, opt){
    opt = opt||{};
    country = country.toLowerCase();
    return 'https://hola.org/access/'+domain+'/using/vpn-'+country+
        (!opt.no_go ? '?go=2' : '');
};

return E; });
