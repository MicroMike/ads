// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
(function(){ // XXX BACKWARD: fixups for old versions
    if (window.is_local_tpopup)
        return;
    var chrome = window.chrome;
    window.is_popup = window.is_popup ||
        (chrome && chrome.extension.getBackgroundPage &&
        chrome.extension.getBackgroundPage()!==window);
    if (!window.is_popup) // XXX arik BACKWARD: popup cache preload in bg
        return;
    // XXX arik BACKWARD: extension <= 1.1.834 didn't set require_is_remote
    window.require_is_remote = true;
    if (window.is_local_ccgi)
        return;
    if (!document.body.className.includes('is-new-ui') &&
        document.body.className.includes('tpopup-new'))
    {
        document.body.style.display = 'none';
    }
})();

require(window.is_local_tpopup ? [] : ['config', '/util/version_util.js',
    '/bext/pub/util.js', 'jquery'],
    function(be_config, version_util, be_util, $)
{
    // XXX arik BACKWARD: popup cache preload in bg
    if (!window.is_popup || window.is_local_tpopup)
        return;
    var conf = window.conf, zconf = window.zon_config;
    var base_url = zconf._RELEASE ? conf.url_bext_cdn4||conf.url_bext :
        conf.url_bext;
    // XXX alexeym: tmp, need to move into /ccgi
    if (window.is_local_ccgi)
        base_url = '/js';
    var qs = '?ver='+be_config.ver;
    // XXX bahaa/mark: add *.css to config.js with md5?
    load_css(base_url+'/svc/pub/css/wbm_flags.css'+qs);
    var logo_link = be_util.browser()=='torch' ?
        'http://torchbrowser.com/hola-for-torch' :
        'https://hola.org?utm_source=holaext';
    var $body = $('body');
    var is_tpopup_new = $body.hasClass('tpopup-new');
    if (!window.is_local_ccgi && !$body.hasClass('is-new-ui') &&
        !is_tpopup_new)
    {
        var old_styles = [get_link('css/bootstrap.css', true),
            get_link('css/be_bootstrap.css', true),
            get_link('bext/vpn/pub/css/popup.css', true)];
        old_styles.forEach(function(link){
            if (link)
                link.parentNode.removeChild(link);
        });
        var $container = window.is_tpopup ? $('#all') : $('body');
        $('body').addClass('is-new-ui');
        $container.hide().html(
            '<div id=header class=popup-header>'+
                '<a class=popup-header-logo tabindex=-1 '+
                'href="'+logo_link+'" '+
                'target=_blank>'+
                    '<i class=popup-header-logo-img></i>'+
                    '<i class=popup-header-logo-img-hover></i>'+
                '</a>'+
            '</div>'+
            '<div id=error class="popup-container popup-global-error">'+
            '</div>'+
            '<div id=popup class="popup-container popup-content"></div>'+
            '<div id=footer class="popup-container popup-footer">'+
                '<div class="popup-footer-content">'+
                    '<table class="r_ui_footer"><tr>'+
                        '<td class="r_ui_share"></td>'+
                        '<td class="r_ui_premium"></td>'+
                    '</tr></table>'+
                '</div>'+
            '</div>');
        load_css(base_url+'/bext/vpn/pub/css/popup.css'+qs, function(){
            update_ui();
            document.body.style.display = null;
            $container.show();
            if (window.be_ui_popup_ext &&
                window.be_ui_popup_ext.waiting_new_ui)
            {
                window.be_ui_popup_ext.init();
            }
        });
    }
    else if (!window.is_local_ccgi)
        reload_css('bext/vpn/pub/css/popup.css', function(){
            // XXX pavlo: remove old be_popup.css. Used by old versions.
            var link = get_link('css/be_popup.css');
            if (link)
                link.parentNode.removeChild(link);
            update_ui();
        });
    else
        update_ui();

    function update_ui(){
        $('body').addClass('css-loaded');
    }

    function reload_css(url, onload){
        var link = get_link(url);
        load_css(base_url+'/'+url+qs, function(){
            if (link)
                link.parentNode.removeChild(link);
            if (onload)
                onload();
        });
    }

    function load_css(url, onload){
        var head = document.getElementsByTagName('head')[0];
        if (!head) /* XXX arik: decide what to do */
            return null;
        var css = document.createElement('link');
        if (onload)
            css.onload = onload;
        css.rel = 'stylesheet';
        css.href = url;
        head.appendChild(css);
        return css;
    }

    function get_link(url, no_strict){
        var links = document.getElementsByTagName('link');
        for (var i=0; i<links.length; i++)
        {
            var href = links[i] && links[i].getAttribute('href');
            if (href==url || (no_strict && href && href.match(url)))
                return links[i];
        }
        return null;
    }
});

(function(){
function get_tpopup_type(){
    return window.hola.tpopup_opt ? window.hola.tpopup_opt.type : undefined; }
function is_vpn(){ return !get_tpopup_type(); }
define(['jquery', 'underscore', '/bext/pub/backbone.js', '/util/etask.js',
    '/util/zerr.js', '/bext/pub/browser.js',
    is_vpn()||!window.is_tpopup ? '/bext/vpn/pub/ui.js' : undefined,
    '/bext/vpn/pub/ui_obj.js', '/util/version_util.js',
    '/bext/pub/popup_lib.js', '/bext/pub/util.js', '/bext/pub/locale.js',
    window.is_local_tpopup ? undefined : 'config', '/util/storage.js',
    '/util/escape.js', '/util/ajax.js', '/bext/vpn/pub/site_trial_ui.js',
    '/bext/vpn/pub/site_premium_ui.js'],
    function($, _, be_backbone, etask, zerr, B, be_ui_vpn, be_ui_obj,
    version_util, be_popup_lib, be_util, T, be_config, storage, zescape, ajax,
    site_trial_ui, site_premium_ui){
B.assert_popup('be_ui_popup_ext');
zerr.set_exception_handler('be', be_popup_lib.err);
var chrome = window.chrome;
var E = new be_backbone.model();
var is_local_ccgi = window.is_local_ccgi;
var be_bg_main = window.be_popup_main ? window.be_popup_main.be_bg_main :
    null;
E.zerr = zerr;
E.be_popup_main = window.popup_main;
E.on('destroy', function(){ E.uninit(); });

function init_first_render(is_custom_html){
    E.render_init.timer = clearTimeout(E.render_init.timer);
    if (E.$el.parent()[0]||is_custom_html==true)
        return;
    $('#popup').empty().append(E.$msg, E.$el, E.$post_msg);
}

E.render_init = function(){
    if (E.render_init.timer)
        return;
    E.render_init.timer = setTimeout(function(){
        try {
            E.render_init.timer = undefined;
            init_first_render();
            be_popup_lib.perr_err({id: 'be_ui_popup_slow_render'});
            E.$el.empty().append((new be_ui_obj.init_view({
                className: 'r_ui_obj_init'})).$el);
        } catch(err){ E.set_err('be_ui_popup_render_init_err', err); }
    }, 2000);
};

function send_render_stats(){
    var count = (E.R.get('popup_render')||0)+1;
    E.R.fcall('set', ['popup_render', count]);
    if (!window.hola) /* XXX arik: BACKWARD <1.1.882 */
        return;
    var err = window.hola.err, t = window.hola.t, info = {};
    t.first_render = !t.r_ui;
    t.r_ui = Date.now();
    var t0 = t.first_render || !t.new_ver ? t.l_start : t.new_ver;
    var diff = t.r_ui - t0, max_slow = 4000;
    info.total_ms = diff;
    info.remote_ms = t.r_start-t0;
    if (t.new_ver)
    {
        if (t.first_render)
        {
            info.new_ver_first_ms = t.new_ver-t0;
            info.new_ver_first_local_ms = t.l_ui-t.l_start;
        }
        else
            info.new_ver_after_ms = t.new_ver-t.l_start;
    }
    else
    {
        info.local_ms = t.l_ui-t.l_start;
        if (!t.first_render)
            info.not_first_render = true;
    }
    if (err && err.require)
        info.require = err.require;
    if (count)
        info.count = count;
    if (be_ui_vpn)
    {
        info.url = be_ui_vpn.get_url();
        info.root_url = be_ui_vpn.get_root();
        var rule_enabled = be_ui_vpn.get_enabled_rule();
        if (rule_enabled)
        {
            info.rule_enabled = {};
            info.rule_enabled.name = rule_enabled.name;
            info.rule_enabled.country = rule_enabled.country;
        }
    }
    be_popup_lib.perr(zerr.L[diff>250 ? 'ERR' : 'NOTICE'],
        {id: 'popup_render'+(diff>max_slow ? '_slow' : ''), info: info});
    if (diff>max_slow)
        E.set('pure_connection', true);
}

E.render_popup = function(){
    var popup_type = get_tpopup_type() || '';
    switch (popup_type)
    {
        case 'site_premium': E.render_site_premium(); break;
        case 'site_trial_try': E.render_site_trial('try'); break;
        case 'site_trial_timer': E.render_site_trial('timer'); break;
        case 'trial_ended': E.render_trial_ended(); break;
        default: E.render_vpn();
    }
};

function set_on(on){
    var $checkbox = $('#g_switch');
    if (on)
    {
        $checkbox.addClass('enabled');
        $checkbox.attr('title', T('Turn off Hola'));
    }
    else
    {
        $checkbox.removeClass('enabled');
        $checkbox.attr('title', T('Turn on Hola'));
    }
}

function switch_cb(){
    var $checkbox = $('#g_switch');
    $checkbox.css('visibility', 'visible');
    set_on(be_bg_main.get('enabled'));
}

E.open_page = function(url){
    B.tabs.update(E.be_tabs.get('active.id'), {url:
        url, active: true});
    if (!window.is_tpopup)
        this.close_popup();
};

E.open_settings = function(tab){
    var qs = {browser: be_util.browser(), ver: be_util.version(),
        plugin: +(E.be_mode.get('mode')=='dll')||undefined,
        uuid: be_bg_main ? be_bg_main.get('uuid') : undefined};
    tab = tab ? '#'+tab : '';
    var settings = 'https://hola.org/access/my/settings?utm_source=holaext&'+
        zescape.qs(qs)+tab;
    E.open_page(settings);
};

var switch_button_html = '<svg class="" id="powerbutton" height="100%" '+
    'width="100%" viewBox="0 0 20 20" style="display:none;"><g>'+
        '<path d="M10,11.7c-0.6,0-1.2-0.5-1.2-1.1V1.1C8.8,0.5,9.4,0,10,'+
        '0c0.6,0,1.2,0.5,1.2,1.1v9.4 C11.2,11.2,10.6,11.7,10,11.7z" />'+
        '<path d="M13.5,1.7v2.4c2.4,1.2,4.1,3.6,4.1,6.4c0,4-3.4,7.2-7.6,'+
        '7.2s-7.6-3.2-7.6-7.2c0-2.8,1.7-5.2,4.1-6.4V1.7 C2.7,3.1,0,6.5,0,'+
        '10.6C0,15.8,4.5,20,10,20s10-4.2,10-9.4C20,6.5,17.3,3.1,13.5,1.7z"/>'+
    '</g></svg>';

E.render_header = function(){
    var $header = $('#header');
    $('.popup-header-controls').remove();
    var $header_controls_right = $('<div>', {'class':
        'popup-header-controls-right popup-header-controls'});
    var $header_controls_left = $('<div>', {'class':
        'popup-header-controls-left popup-header-controls'});
    if (window.is_tpopup)
    {
        $('<div>', {'class': 'popup-header-controls-item'}).append($('<div>',
            {id: 'tpopup_close', 'class': 'popup-header-controls-button '+
            'popup-header-close'}))
        .append($('<div>', {id: 'tpopup_close_hint', 'class': 'popup-hint '+
            'popup-header-close-hint'}))
        .appendTo($header_controls_right);
    }
    else
    {
        var $checkbox = $('<div>', {id: 'g_switch', 'class':
            'popup-header-controls-button popup-header-switch'});
        $checkbox.html(switch_button_html);
        $('<div>', {'class': 'popup-header-controls-item'}).append($checkbox)
        .appendTo($header_controls_right);
        $checkbox.click(function(){
            // XXX alexeym: need to show user why it doesn't work
            // maybe scale for 1 sec error message (E.err_view)
            if (E.be_ext.get('ext.conflict'))
                return;
            var on = !$checkbox.hasClass('enabled');
            set_on(on);
            /* XXX arik: need to handle error */
            be_bg_main.fcall('set_enabled', [on]);
        });
    }
    $header.prepend($header_controls_left);
    $header.append($header_controls_right);
    E.listen_to(be_bg_main, 'change:enabled', switch_cb);
};

E.render_footer = function(){
    var $td = $('#footer .r_ui_premium').empty();
    $('<a>', {href: 'https://hola.org/access/popular',
        target: '_blank'})
    .text(T('Popular sites')).appendTo($td);
};

function render_vpn(){
    if (!be_ui_vpn || be_ui_vpn.$el.parents('body')[0])
        return; /* XXX arik: should never happen */
    E.listenToOnce(be_ui_vpn, 'render_done', function(){
        send_render_stats();
        init_first_render();
        E.$el.empty().append(be_ui_vpn.$el);
    });
    if (window.is_tpopup)
        parent.postMessage({id: 'tpopup.show'}, '*');
    E.render_header();
    E.render_footer();
    be_ui_vpn.init(E);
    be_ui_vpn.is_visible = true;
}

E.render_vpn = function(){
    if (be_ui_vpn)
        return render_vpn();
};

E.render_site_premium = function(){
    var site_trial = new site_premium_ui({
        be_ext: E.be_ext,
        be_tabs: E.be_tabs,
        be_premium: E.be_premium,
        close: E.close_popup,
    });
    var $all = $('#all').empty();
    init_first_render(true);
    E.$el.empty();
    E.$el.append(site_trial.render().$el).appendTo($all);
    parent.postMessage({id: 'tpopup.show'}, '*');
};

E.render_site_trial = function(type){
    var types = {try: 'try_view_class', timer: 'timer_view_class'};
    var site_trial = new site_trial_ui[types[type]]({
        be_premium: E.be_premium,
        be_info: E.be_info,
        be_tabs: E.be_tabs,
        be_rule: E.be_rule,
        be_ext: E.be_ext,
        close: E.close_popup,
    });
    var $all = $('#all').empty();
    init_first_render(true);
    E.$el.empty();
    E.$el.append(site_trial.render().$el).appendTo($all);
    parent.postMessage({id: 'tpopup.show'}, '*');
};

E.render_trial_ended = function(type){
    var $all = $('#all').empty();
    init_first_render(true);
    E.$el.empty();
    var trial_ended = new be_ui_obj.trial_ended({
        be_tabs: E.be_tabs,
        close: E.close_popup,
    });
    E.$el.append(trial_ended.render().$el).appendTo($all);
    parent.postMessage({id: 'tpopup.show'}, '*');
    E.be_info.ecall('set_dont_show_again', [{
        root_url: 'all',
        period: '1d',
        src: 'trial_ended',
        tab_id: window.hola.tpopup_opt.tab_id,
        type: 'trial_ended',
    }]);
};

E.render_error = function(msg, err){
    try {
        init_first_render();
        $('#rmt_spinner').remove(); /* XXX arik: rm */
        if (!this.ui_error)
        {
            be_popup_lib.perr_err({id: 'be_ui_popup_render_error', err: err,
                info: {msg: msg}});
            this.ui_error = new be_ui_obj.error_view({className:
                'r_ui_obj_error'});
        }
        E.$el.empty().append(this.ui_error.$el);
    } catch(e){
        console.error('render error %s', zerr.e2s(e));
        be_popup_lib.perr_err({id: 'be_ui_popup_render_error_err', err: e});
    }
};

function storage_err_cb(){
    if (!be_util.get('storage.err'))
        return;
    E.stopListening(be_util, 'change:storage.err');
    var last = be_util.get('storage.last_error');
    be_popup_lib.perr_err({id: 'storage_err',
        info: last&&(last.api+' '+last.key), err: last&&last.err});
}

E.init = function(){
    try {
        if (E.R)
            return;
        // XXX alexeym: hack for waiting new UI html
        if (!$('body').hasClass('is-new-ui') &&
            !$('body').hasClass('tpopup-new'))
        {
            window.be_ui_popup_ext = E;
            E.waiting_new_ui = true;
            return;
        }
        E.waiting_new_ui = false;
        be_bg_main = E.be_popup_main && E.be_popup_main.be_bg_main;
        // XXX alexeym: disable popup/tpopup if no chrome.proxy in
        // chromium browser (Opera version < 20)
        if (be_util.no_proxy())
        {
            render_opera_warning();
            return;
        }
        if (!B.inited)
        {
            B.init();
            $(window).on('unload', function(){ E._destroy(); });
        }
        if (!E.$el)
        {
            if (window.hola)
                window.hola.t.r_start = Date.now();
            E.$msg = $('<div>', {class: 'be_ui_popup_msg'});
            E.$el = $('<div>', {class: 'be_ui_popup'});
            E.$post_msg = $('<div>', {class: 'be_up_popup_msg'});
            window.ui_popup = E;
            if (be_bg_main && !be_bg_main.get('rmt_loaded'))
            {
                zerr('rmt not loaded, trying to load it');
                be_bg_main.fcall('load_rmt', []);
            }
        }
        if (!E.start)
        {
            E.start = new Date();
            $('body').addClass('rmt'); /* XXX arik: rm */
            $('#rmt_spinner').remove(); /* XXX arik: rm */
            E.render_init();
        }
        if (!E.rmt_ping)
        {
            /* XXX arik: need to ping all remote objects */
            B.backbone.client.ping('RMT', 500, function(ret){
                if (!ret.error)
                    E.rmt_ping = true;
                else
                    zerr('popup ping bg failed %s', zerr.json(ret));
                return E.init();
            });
            return;
        }
        zerr.notice('popup got bg');
        E.R = B.backbone.client.start('RMT');
        E.be_ext = B.backbone.client.start('be_ext');
        E.be_svc = B.backbone.client.start('be_svc');
        E.be_mode = B.backbone.client.start('be_mode');
        if (is_vpn())
            E.be_vpn = B.backbone.client.start('be_vpn');
        E.be_rule = B.backbone.client.start('be_rule');
        E.be_info = B.backbone.client.start('be_info');
        E.be_tabs = B.backbone.client.start('r.be_tabs');
        E.be_premium = B.backbone.client.start('be_premium');
        var be_rmt_operations = B.backbone.client.start('be_rmt_operations');
        ajax.do_op = function(){
            be_rmt_operations.ecall('do_op', arguments); };
        E.listen_to(be_util, 'change:storage.err', storage_err_cb);
        E.R.on('destroy', r_destroy_cb);
        E.R.on_init('change:status', r_status_cb);
        E.R.on_init('change:inited', inited_cb);
        E.be_ext.on('change:r.ext.enabled', inited_cb);
        // XXX arik hack: separate ext.conflict from need_upgrade logic
        E.listen_to(E.be_ext, 'change:need_upgrade change:need_svc_upgrade '+
            'change:ext.conflict', need_upgrade_cb);
        E.listen_to(E.be_ext, 'change:ext.conflict', ext_conflict_cb);
        if (B.use_msg)
        {
            E.R.on('change:_backbone_client_started', inited_cb);
            E.be_ext.on('change:_backbone_client_started', inited_cb);
            if (is_vpn())
                E.be_vpn.on('change:_backbone_client_started', inited_cb);
            E.be_rule.on('change:_backbone_client_started', inited_cb);
            E.be_info.on('change:_backbone_client_started', inited_cb);
            E.be_tabs.on('change:_backbone_client_started', inited_cb);
            E.be_premium.on('change:_backbone_client_started', inited_cb);
        }
        E.listen_to(E.be_ext, 'change:is_premium', function(){
            $('body').toggleClass('user-premium',
                !!E.be_ext.get('is_premium'));
            storage.set('ui_cache_is_premium', +!!E.be_ext.get('is_premium'));
        });
        /* XXX arik: need handling of js errors, reload new ver, ver
         * mismatch */
    } catch(err){
        E.set_err('be_ui_popup_init_err', err);
    }
};

E.uninit_user_nav = function(){
    if (E.nav)
        E.nav.remove();
    E.nav = undefined;
};

E.uninit = function(){
    try {
        if (check_ver.etask)
            check_ver.etask.return();
        E.render_init.timer = clearTimeout(E.render_init.timer);
        E.uninit_user_nav();
        if (be_ui_vpn && be_ui_vpn.inited)
            be_ui_vpn._destroy();
        if (E.R)
        {
            E.R.off('destroy', r_destroy_cb);
            E.R.off('change:inited', inited_cb);
            E.R.off('change:status', r_status_cb);
            E.be_ext.off('change:r.ext.enabled', inited_cb);
            if (E.be_vpn)
                E.be_vpn.off('change:status', status_cb);
            B.backbone.client.stop('be_premium');
            B.backbone.client.stop('be_rmt_operations');
            B.backbone.client.stop('r.be_tabs');
            B.backbone.client.stop('be_info');
            if (is_vpn())
            {
                B.backbone.client.stop('be_rule');
                B.backbone.client.stop('be_vpn');
            }
            B.backbone.client.stop('be_mode');
            B.backbone.client.stop('be_svc');
            B.backbone.client.stop('be_ext');
            B.backbone.client.stop('RMT');
        }
        B._destroy();
    } catch(err){
        zerr('be_ui_popup err: %s', err.stack||err);
        be_popup_lib.perr_err({id: 'be_ui_popup_destroy', err: err});
    }
};

E.load_new_ver = function(ver){
    if (is_local_ccgi)
        return; // XXX arik: need local_ccgi
    try {
        if (E.load_new_ver_start)
            return;
        /* XXX arik: need timer that after 10sec we do full reload */
        E.load_new_ver_start = new Date();
        if (window.hola)
            window.hola.t.new_ver = Date.now();
        be_popup_lib.perr_ok({id: 'ui_popup_load_new_ver', info: ver});
        be_config.undef();
        require.config({urlArgs: 'rand='+Math.random()});
        if (window.hola && window.hola.no_be_ver)
        {
            require(ver ? ['config'] : ['config', 'be_ver'],
                function(_be_config, be_ver){
                var country;
                if (ver && E.get('info'))
                    country = E.get('info').country;
                else if (be_ver && be_ver.country)
                    country = be_ver.country;
                _be_config.init(ver ? ver : be_ver.ver, country);
                load_rmt();
            });
        }
        else
        {
            require(['be_ver'], function(be_ver){
                require(['config'], function(be_config){ load_rmt(); }); });
        }
    } catch(err){
        console.error('be_ui_popup destroy failed, try reload '+
            (err.stack||err));
        location.reload();
    }

    function load_rmt(){
        require(['/bext/vpn/pub/ui_popup.js'], function(be_ui_popup){
            try { E._destroy(); }
            catch(err){
                console.error('be_ui_popup destroy failed, try '+
                    'reload '+ (err.stack||err));
                location.reload();
            }
            be_ui_popup.init();
        });
    }
};

function r_destroy_cb(){
    /* XXX arik: call E.destroy() */
    zerr.notice('rmt desotryed, reloading popup');
    E.load_new_ver();
}

function r_status_cb(){
    if (E.R.get('status')!='error')
        return;
    zerr('RMT had an error, trying once to recover');
    E.R.off('change:status', r_status_cb);
    return E.R.fcall('init_cb', ['']);
}

function need_upgrade_cb(){
    var need_upgrade = E.be_ext.get('need_upgrade');
    var need_svc_upgrade = E.be_ext.get('need_svc_upgrade');
    var ext_conflict = E.be_ext.get('ext.conflict');
    E.$msg.empty();
    if (!need_upgrade&&!need_svc_upgrade&&!ext_conflict)
        return void E.$el.show();
    if (ext_conflict)
        return void E.$el.hide();
    if (need_upgrade)
        E.$el.hide();
    be_popup_lib.perr_err({id: need_upgrade ? 'be_need_upgrade_view' :
        'be_need_svc_upgrade_view'});
    var $div = $('<div>', {class: 'r_ui_popup_msg'});
    $('<h4>').appendTo($div)
    .text('Your version of Hola is not supported anymore.');
    $('<a>', {class: 'btn btn-upgrade'})
    .appendTo($div).text('Upgrade now').click(function(){
        be_popup_lib.perr_err({id: need_upgrade ? 'be_need_upgrade_click' :
            'be_need_svc_upgrade_click'});
        var zconf = window.zon_config;
        var browser = be_util.browser();
        var qs;
        if (need_upgrade)
        {
            var id = browser!='chrome' ? browser : zconf.BEXT_PLUGIN ?
                'cws_plugin' : 'cws';
            qs = 'utm_source=holaext&ref=popup&id='+id;
        }
        else
            qs = 'utm_source=holaext&ref=popup&upgrade=1';
        var url = 'https://hola.org/download?'+qs;
        be_util.open_tab({url: url});
    });
    E.$msg.append($div);
}

function is_common_inited(){
    return E.R.get('_backbone_client_started') &&
        E.be_ext.get('_backbone_client_started') &&
        E.be_info.get('_backbone_client_started') &&
        E.be_tabs.get('_backbone_client_started') &&
        E.be_premium.get('_backbone_client_started');
}

function is_vpn_inited(){
    return E.be_vpn.get('_backbone_client_started') &&
        E.be_rule.get('_backbone_client_started');
}

function inited_cb(){
    if (B.use_msg)
    {
        if (!is_common_inited())
            return;
        if (is_vpn() && !is_vpn_inited())
            return;
    }
    if (!E.R.get('inited'))
        return void E.render_init();
    if (!window.is_tpopup && E.be_vpn && B.have['tabs.disconnect'])
    {
        etask([function(){
            return E.be_vpn.ecall('tpopup_is_connected',
                [E.be_tabs.get('active.id')]);
        }, function(tpopup_type){
            if (tpopup_type && typeof tpopup_type!='string' ||
                ['site_trial_try', 'site_premium', 'site_trial_timer_test']
                .includes(tpopup_type))
            {
                B.tabs.disconnect(E.be_tabs.get('active.id'));
            }
        }]);
    }
    E.R.off('change:inited', inited_cb);
    if (E.be_ext)
        E.be_ext.off('change:r.ext.enabled', inited_cb);
    if (is_vpn())
        E.be_rule.ecall('task_cancel_all', []);
    active_tab_fixup();
    if (E.be_info)
        check_ver();
    if (E.be_vpn)
        E.be_vpn.on_init('change:status', status_cb);
    else
        status_cb();
}

E.close_popup = function(opts){
    if (window.is_tpopup)
    {
        // XXX alexeym: never should happens
        if (!opts)
            return be_popup_lib.perr_err({id: 'be_ui_tpopup_close_no_opts'});
        return E.set_dont_show_again(opts);
    }
    if (chrome)
        return window.close();
    if (B.have['firefox.panel.close'])
        B.firefox.panel.close();
};

function active_tab_fixup(){
    if (window.is_tpopup)
        return;
    E.listenToOnce(E.be_tabs, 'change:active.id', function(){
        E.close_popup();
    });
    if (!chrome || !chrome.tabs)
        return;
    B.tabs.query({currentWindow: true, active: true}, function(tabs){
        if (tabs && tabs.length && tabs[0].id!=E.be_tabs.get('active.id'))
            window.close();
    });
}

function check_ver(){
    if (is_local_ccgi || window.is_local_tpopup)
        return;
    var step = '';
    return etask([function(){
        check_ver.etask = this;
        step = 'checking ver';
        return E.be_info.ecall('epopup_new', []);
    }, function(info){
        step = 'ver found';
        E.set('info', info);
        if (info.ver!=E.R.get('ver'))
        {
            step = 'ver mismatch';
            E.R.off('destroy', r_destroy_cb);
            E.R.on('destroy', function(){ E.load_new_ver(info.ver); });
            step = 'load new ver';
            E.R.fcall('load_new_ver', [info.ver]);
            return this.return();
        }
    }, function catch$(err){
        E.set_err('be_ui_popup_check_ver_err', {err: err, step: step});
    }, function finally$(){ check_ver.etask = undefined; }]);
}

function ext_conflict_cb(){
    var $msg;
    $('#error').empty();
    if (E.err_view)
        E.err_view.remove();
    if (E.be_ext.get('ext.conflict'))
    {
        E.err_view = new be_ui_obj.err_view({title:
            T('Hola cannot work because another extension is '+
            'controlling your proxy settings.'),
            text: T('Please disable other <a>extensions</a> that you '+
            'think might control your proxy settings such as '+
            'ad-blockers, other VPN services, etc.')});
        $msg = E.err_view.$el;
        $msg.appendTo(E.$msg);
        $msg.find('a').click(function(){
            B.tabs.create({url: 'chrome://extensions/'}); });
    }
}

function render_opera_warning(){
    $('.r_warnings').remove();
    var $el = $('<div>', {class: 'r_warnings'}).insertBefore($('#error'));
    $('<div>', {class: 'r_ui_vpn_compat'})
    .appendTo($el).append($('<span>'+T('You need to upgrade to the latest '+
        'version of Opera to use Hola. Press <a>here</a> to upgrade.')+
        '</span>'))
    .find('a').attr('target', '_blank').attr('href',
        'http://www.opera.com/download');
}

function status_cb(){
    if (E.be_vpn && E.be_vpn.get('status')=='error')
    {
        if (E.get('tried_recover'))
            return;
        zerr('trying auto-recover');
        E.set('tried_recover', true);
        E.be_vpn.fcall('trigger', ['recover']);
        return;
    }
    if (E.be_vpn && E.be_vpn.get('status')=='busy')
        return;
    E.set('inited', true);
    zerr.notice('popup inited');
    if (E.be_vpn)
        E.be_vpn.off('change:status', status_cb);
    E.render_popup();
    if (!storage.get_int('ui_popup_inited'))
        storage.set('ui_popup_inited', 1);
    if (storage.get_int('ajax_timeout'))
        storage.clr('ajax_timeout');
    if (storage.get_int('ui_popup_init_err'))
    {
        be_popup_lib.perr_ok({id: 'be_ui_popup_recover',
            info: 'erros '+storage.get_int('ui_popup_init_err')});
        storage.clr('ui_popup_init_err');
    }
}

E.set_dont_show_again = function(opt){
    var done, done_anim;
    if (!window.is_tpopup)
        return;
    return etask([function(){
        // XXX arik/bahaa: if we don't wait for perr, the json will
        // fail when we close the tpopup
        $('body').addClass('hide_anim');
        // XXX arik/mark/alexeym hack: can we get event for animation end
        setTimeout(function(){
            done_anim = true;
            if (done)
                parent.postMessage({id: 'tpopup.close'}, '*');
            else
                parent.postMessage({id: 'tpopup.hide'}, '*');
        }, 1000);
        return E.be_info.ecall('set_dont_show_again', [opt]);
    }, function finally$(){
        done = true;
        if (done_anim)
            parent.postMessage({id: 'tpopup.close'}, '*');
    }]);
};

E.set_err = function(err, _err){
    try {
        zerr('be_ui_set_err %s %s', err, _err ? _err&&_err.stack : '');
        be_popup_lib.err(err, '', _err);
    } catch(e){ console.error('set_err error %s %s', err, e.stack||e); }
    if (_err=='Error: load_new_ver') /* XXX arik: can this happen? */
        location.reload();
    else
        E.render_error(err, _err);
};

return E; }); })();
