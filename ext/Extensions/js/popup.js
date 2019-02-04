// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define([], function(){
var E = {};

function _init_ga(be_popup_main, ga){
    var be_bg_main = be_popup_main.be_bg_main;
    var done = _init_ga.bind(this, be_popup_main, ga);
    // be_bg_main has async init
    if (!be_bg_main)
        return void setTimeout(done, 500);
    if (!be_bg_main.get('uuid'))
        return void be_bg_main.listenToOnce(be_bg_main, 'change:uuid', done);
    // sample 10% only to reduce ga hits to allowed limit
    ga.init(window.is_tpopup ? 'UA-41964537-14' : 'UA-41964537-13',
        false, {sample_rate: '10', cid: be_bg_main.get('uuid'),
        use_xhr: true});
}

function init_popup_main(){
    require(['/bext/vpn/pub/popup_main.js', '/bext/pub/ga.js'],
        function(be_popup_main, ga){
        window.be_popup_main = be_popup_main;
        be_popup_main.init();
        _init_ga(be_popup_main, ga);
    });
}

function _init(conf, zon_config, opt){
    opt = opt||{};
    window.hola.t = {l_start: Date.now()};
    window.hola.tpopup_opt = opt;
    // XXX arik BACKWARD: <1.1.895 old extensions required be_ver in be_config
    window.hola.no_be_ver = true;
    // XXX arik: try to avoid using globals
    // XXX bahaa HACK: fix CORS properly
    if (window.is_tpopup && location.protocol=='https:')
        conf.url_ccgi = conf.url_ccgi.replace(/^http:/, 'https:');
    window.conf = conf;
    window.zon_config = zon_config;
    window.is_popup = true; // XXX arik: review
    if (window.is_local_tpopup)
        return init_popup_main();
    if (opt.ver)
        require.config({urlArgs: 'ver='+opt.ver});
    require(['config'].concat(opt.ver ? [] : 'be_ver'),
        function(be_config, be_ver){
            be_config.init(opt.ver||be_ver.ver, '');
            init_popup_main();
        });
}
E.init = _init;

function conf_by_msg(){
    window.addEventListener('message', function cb(e){
        // XXX alexeym: find a way to load extension id for tpopup
        // to check e.origin
        var msg = e.data;
        if (!msg || msg.id!='tpopup.init')
            return;
        window.removeEventListener('message', cb);
        _init(msg.conf, msg.zon_config, msg);
    }, false);
    parent.postMessage({id: 'tpopup.init'}, '*');
}

function init(){
    if (!window.is_tpopup)
        window.hola.base.perr({id: 'be_popup_create'});
    require.config({waitSeconds: 0, enforceDefine: true});
    require.onError = window.hola.base.require_on_error;
    if (window.is_tpopup)
        return void conf_by_msg();
    require(['conf', 'zon_config'], _init);
}
if (!window.is_local_tpopup)
    init();
return E; });
