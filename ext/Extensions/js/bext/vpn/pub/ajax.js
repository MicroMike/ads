// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['/util/ajax.js', '/util/storage.js', '/util/etask.js',
    '/bext/pub/browser.js'],
    function(ajax, storage, etask, B){
// ajax module with global logging of timeouts
// notice: no matter what module uses it, ALL of timeouts
// will be logged, because ajax.events are global
var E = wrapper(ajax);

function wrapper(o){
    var be_lib;
    require([window.hola && B.is_popup() ? '/bext/pub/popup_lib.js' :
        '/bext/pub/lib.js'], function(lib){ be_lib = lib; });
    var check_url = function(url){
        if (!be_lib || !url || !url.startsWith('http:'))
            return;
        be_lib.perr_err({id: 'ajax_http_url', rate_limit: {count: 5},
            info: {url: url}});
    };
    var res = function(opt){
        check_url(opt.url);
        return ajax(opt);
    };
    for (var f in o)
    {
        res[f] = (function(name){
            return function(opt){
                check_url(opt.url);
                return ajax[name](opt);
            };
        })(f);
    }
    return res;
}

ajax.events.on('timeout', function(){
    storage.set('ajax_timeout', storage.get_int('ajax_timeout')+1);
});

// XXX pavlo: better to create special endpoint for API, w/o csrf checks
// makes xhr calls to https://hola.org
// data, method - the same as for $.ajax
// text - whether response is text, by default response is parsed as json
E.hola_api_call = function(path, opt){
    opt = opt||{};
    opt.method = opt.method||'GET';
    // XXX pavlo: FF with webextension doesn't pass Origin header during xhr,
    // because CORS is allowed for extensions, and even for POST requests,
    // which require Origin, FF doesn't add it because of bug bugzilla#446344.
    // csrf check fails on server side.
    // fetch API adds Origin header, but it's something like
    // moz-extension://random-guid-for-each-installation
    // (https://stackoverflow.com/a/47060021) which is useless
    var xsrf_header = window.conf.firefox_web_ext && B.have['cookies.get'] &&
        !['GET', 'HEAD', 'OPTIONS'].includes(opt.method);
    return etask([function(){
        if (!xsrf_header)
            return;
        return etask.cb_apply(B.cookies, '.get',
            [{url: 'https://hola.org/', name: 'XSRF-TOKEN'}]);
    }, function(c){
        return ajax({
            url: 'https://hola.org/'+path,
            data: opt.data,
            method: opt.method,
            headers: c && {'x-xsrf-token': c.value},
            json: !opt.text,
            // XXX pavlo: FF content script requires this to send cookies,
            // popup and bg send cookies regardless this option
            with_credentials: true,
        });
    }]);
};

return E; });
