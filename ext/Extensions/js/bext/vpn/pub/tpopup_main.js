// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define([], function(){
var E = {};
E.files = [
    {name: 'pre_loader', file: 'pre_loader.js', path: '/bext/pub/',
        ignore: true},
    {name: 'popup', file: 'popup.min.js', path: '/bext/vpn/pub/'},
    {name: 'popup_css', file: 'popup.css', path: '/bext/vpn/pub/css/'},
];

E.init = function(){
    if (E.inited)
        return;
    require(['text!bext/vpn/pub/popup.min.js', 'text!bext/pub/pre_loader.js',
        'text!bext/vpn/pub/css/popup.css'],
        function(popup, pre_loader, popup_css){
        Object.assign(E, {popup: popup, pre_loader: pre_loader,
            popup_css: popup_css});
        E.inited = true;
    });
};

E.view = function(frame, opt){
    var head;
    var omit = function(obj, arr){
        var i, o = {};
        obj = Object(obj);
        for (i in obj)
        {
            if (!arr.includes(i))
                o[i] = obj[i];
        }
        return o;
    };
    var on_load = function(){
        var script = document.createElement('script');
        script.type = 'text/javascript';
        var names = ['files', 'get_view'];
        if (opt.files)
            opt.files.forEach(function(f){ names.push(f.name); });
        script.text = 'window.is_popup = window.is_local_tpopup = true;'+
            opt.popup+';('+on_loaded.toString()+')('+JSON.stringify(omit(opt,
            names))+')';
        head.appendChild(script);
    };
    var on_loaded = function(opt){
        window.is_tpopup = true;
        require.onError = window.hola.base.require_on_error;
        require.config({map: {'*': {events: '/util/events.js'}}});
        window.conf = opt.conf;
        window.zon_config = opt.zon_config;
        window.hola.tpopup_opt = opt;
        require(['jquery', '/bext/vpn/pub/popup.js',
            'text!views/tpopup_ui.html'], function($, popup, tpopup_ui){
            var cl, html = '<div id=all></div>';
            switch (opt.type)
            {
            case 'site_trial_try':
            case 'site_trial_timer': cl = 'site_trial_popup'; break;
            case 'trial_ended': cl = 'trial_ended_popup'; break;
            default:
                cl = '';
                html = tpopup_ui;
            }
            $(document.body).html(html).addClass('is-new-ui '+cl)
            .attr('id', 'tpopup_body');
            if (opt.locale)
                try { localStorage.setItem('locale', opt.locale); } catch(e){}
            popup.init(opt.conf, opt.zon_config, opt);
        });
    };
    var add_style = function(text){
        var node = document.createElement('style');
        node.innerHTML = text;
        head.appendChild(node);
    };
    var load_css = function(url, onload){
        var node = document.createElement('link');
        if (onload)
            node.addEventListener('load', onload, false);
        node.rel = 'stylesheet';
        node.href = url;
        head.appendChild(node);
    };
    var add_script = function(param){
        var node = document.createElement('script');
        node.type = 'text/javascript';
        if (param.text)
            node.text = param.text;
        if (param.src)
        {
            node.src = param.src;
            if (param.on_load)
                node.addEventListener('load', param.on_load, false);
        }
        head.appendChild(node);
    };
    return {
        init: function(contents){
            head = contents.find('head')[0];
            add_script({text: 'document.open();'+
                'document.write("<!DOCTYPE html>");document.close()'});
            head = contents.find('head')[0];
            var qs = '?ver='+opt.ver, base_url = opt.base_url;
            if (opt.load_css_remote)
            {
                var body = contents.find('body');
                body.css({visibility: 'hidden'});
                load_css(base_url+'/bext/vpn/pub/css/popup.css'+qs, function(){
                    load_css(base_url+'/svc/pub/css/wbm_flags.css'+qs,
                        function(){ body.css({visibility: 'visible'}); });
                });
            }
            else if (opt.inject_css)
            {
                var node = document.createElement('base');
                node.setAttribute('href', base_url+'/bext/vpn/pub/css/');
                head.appendChild(node);
                add_style(opt.popup_css);
                // XXX nikita: unite with popup.css
                load_css(base_url+'/svc/pub/css/wbm_flags.css'+qs);
            }
            else
            {
                load_css(opt.ext_url+'/bext/vpn/pub/css/popup.css'+qs);
                load_css(opt.ext_url+'/svc/pub/css/wbm_flags.css'+qs);
            }
            add_script({text: opt.pre_loader});
            add_script({src: opt.ext_url+'/require.js', on_load: on_load});
        },
    };
};

return E; });
