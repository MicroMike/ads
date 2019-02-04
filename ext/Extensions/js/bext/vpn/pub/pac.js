// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['/bext/pub/browser.js', '/bext/pub/backbone.js', '/util/etask.js',
    '/bext/pub/lib.js', '/bext/pub/ext.js', '/util/version_util.js',
    '/protocol/pub/pac_engine.js', '/bext/pub/util.js', 'underscore',
    '/bext/vpn/pub/svc.js', '/util/zerr.js', '/util/date.js',
    '/util/escape.js', '/util/util.js', '/bext/vpn/pub/mode.js',
    '/util/user_agent.js', '/bext/vpn/pub/hybrid_mock.js'],
    function(B, be_backbone, etask, be_lib, be_ext, version_util, pac_engine,
    be_util, _, be_svc, zerr, date, zescape, zutil, be_mode, user_agent,
    hybrid_mock){
var conf = window.conf, ff_webext = conf.firefox_web_ext2;
var pac_file_set, pac_file_last, chrome;
var cb_wrapper = zerr.catch_unhandled_exception;
var E = new (be_backbone.task_model.extend({
    _defaults: function(){
	this.stats = {total: 0, slow: {10: 0, 100: 0, 1000: 0}};
	this.on('destroy', function(){ E.uninit(); });
    },
}))();

E.init = function(){
    chrome = window.chrome;
    E.timer = setTimeout(function(){
	if (E.stats.slow['100'] || E.stats.slow['1000'])
	{
	    be_lib.perr_err({id: 'be_tab_unblocker_slow',
		info: zerr.json(E.stats)});
	}
    }, date.ms.HOUR);
};

E.uninit = function(){ E.timer = clearTimeout(E.timer); };

function get_pac_scope(){
    if (chrome && chrome.extension && chrome.extension.inIncognitoContext)
        return 'incognito_session_only';
    return 'regular_only';
}

E.set_pac = function(script){
    pac_file_set = !!script;
    if (script && !ff_webext)
	pac_file_last = script;
    var scope = get_pac_scope();
    return etask([function(){
	this.alarm(5000, {throw: 'proxy.settings timeout'});
        if (script)
        {
            return etask.cb_apply(B.proxy.settings, '.set',
		[{scope: scope,
                value: {mode: 'pac_script', pacScript: {data: script}}}]);
        }
        // XXX arik/bahaa: need to clear settings on shutdown
	return etask.cb_apply(B.proxy.settings, '.clear', [{scope: scope}]);
    }, function(){
	be_ext.set('status.unblocker.effective_pac_url', script);
	E.has_pac = !!script;
    }]);
};

// XXX amir: temp workaround for cyclic dependency, rules are from
// be_tab_unblcoker
function check_need_ext_settings(){
    return E.rules && _.keys(E.rules.unblocker_rules).length &&
        be_ext.get('r.vpn.on');
}

E.load_pac_file = function(last, force){
    var has_pac = E.has_pac;
    E.has_pac = false;
    if (!chrome)
	return;
    if (!check_need_ext_settings() && !force)
	return E.set_pac(null);
    if (!E.rules && !pac_file_set && pac_file_last)
	return E.set_pac(pac_file_last);
    if (has_pac)
        return E.has_pac = true;
    var arr = new Uint8Array(32), key = '';
    window.crypto.getRandomValues(arr);
    _.each(arr, function(a){ key += a.toString(16); });
    E.pac_key = key;
    var json = {unblocker_rules: {}};
    var options = {do_redir: false, ext: 1, key: E.pac_key};
    if (ff_webext)
        hybrid_mock.set_pac_opt(json, options);
    E.set_pac(pac_engine.gen_pac(json, options));
    E.has_pac = true;
};

E.load_pac_cb = cb_wrapper(function(){
    E.init_tab_listeners();
    E.load_pac_file();
});

function hex_encode(s){
    s = unescape(encodeURIComponent(s));
    var h = '';
    for (var i = 0; i < s.length; i++)
        h += s.charCodeAt(i).toString(16);
    return h;
}

E.set_proxy_for_url = function(url, proxy_str){
    if (!E.pac_key && !zutil.is_mocha())
        return;
    var b = be_util.browser_guess, n;
    // from chrome 52 https requests truncate the path when passed to PAC
    // https://bugs.chromium.org/p/chromium/issues/detail?id=619097
    if (b.browser=='chrome' && +b.version>=52)
    {
        n = url.match(/^((https|wss):\/\/[^\/]+\/)/);
        if (n)
            url = n[1];
    }
    // the path of all requests is truncated in firefox
    // for http requests it's a bug
    // https://bugzilla.mozilla.org/show_bug.cgi?id=1337001
    if (b.browser=='firefox')
    {
        n = url.match(/^(https?:\/\/[^\/]+\/)/);
        if (n)
            url = ff_webext ? n[1].slice(0, -1) : n[1];
    }
    // XXX bahaa: find a way around the problem of truncated path. if we get
    // example.com/geocheck.json and example.com/vid.mp4 and we decide PROXY
    // and DIRECT respectively, the pac might confuse the two.
    var t0, diff, xhr = new XMLHttpRequest();
    /* we use sync request to make sure the url is set in the pac before we
     * proceed with the request, async requests work most of the time.
     * in test, the mock XMLHTTPRequest implements sync requests by spawning
     * another instance of node, which prevents us from using nock, which
     * needs to overrides node's Request, but doesn't override Request of the
     * spawned node, so we use async in this case. */
    var prefix = hex_encode(JSON.stringify({
        proxy: proxy_str,
        set: url,
        key: E.pac_key||'1',
    }));
    xhr.open('POST', 'http://'+prefix+'.local.hola/', zutil.is_mocha());
    E.stats.total++;
    t0 = Date.now();
    try { xhr.send(null); } catch(e){}
    if ((diff = Date.now()-t0) > 10)
    {
	E.stats.slow[diff>1000 ? '1000' : diff>100 ? '100' : '10']++;
	if (diff>100)
	    zerr('tab_unblocker slow %dms stats %s', diff, zerr.json(E.stats));
    }
};

return E; });
