// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', '/bext/pub/backbone.js', '/util/etask.js',
    '/bext/vpn/pub/util.js', '/svc/pub/util.js',
    '/util/version_util.js', '/util/zerr.js', '/bext/pub/util.js',
    '/bext/pub/locale.js', '/bext/vpn/pub/social.js',
    '/bext/pub/browser.js', '/util/url.js', '/util/string.js',
    '/bext/pub/popup_lib.js', '/protocol/pub/countries.js',
    '/svc/pub/search.js', '/util/date.js', '/util/util.js',
    'backbone', '/util/user_agent.js', '/util/storage.js',
    '/bext/vpn/pub/defines.js', '/util/util.js', '/bext/pub/ga.js',
    '/util/zdot.js', 'text!views/install_exe.html', '/util/escape.js',
    'text!views/ext_promo.html', 'text!views/country_list_item.html',
    'text!views/popup_disabled.html', '/bext/vpn/pub/ui_obj.js',
    'text!views/menu.html', 'text!views/menu_account.html',
    'text!views/rated.html', '/bext/vpn/pub/ajax.js',
    'text!views/menu_products.html', 'text!views/country_premium.html',
    '/bext/vpn/pub/site_trial_ui.js', '/bext/vpn/pub/site_premium_ui.js'],
    function($, _, be_backbone, etask, be_vpn_util, svc_util,
    version_util, zerr, be_util, T, be_social, B, zurl, string, be_popup_lib,
    pcountries, search, date, util, Backbone, user_agent, storage,
    be_defines, zutil, ga, zdot, install_exe,
    zescape, ext_promo, country_list_item, popup_disabled,
    be_ui_obj, menu_template, menu_account_template, rated_template, ajax,
    menu_products_template, country_premium_template, site_trial_ui,
    site_premium_ui)
{
B.assert_popup('be_ui_vpn');
var E = new (be_backbone.model.extend({
    _defaults: function(){ this.$el = $('<div>', {class: 'be_ui_vpn'}); },
}))();
var SEC = date.ms.SEC, assign = Object.assign;
var browser = be_util.browser();
var chrome = window.chrome, is_tpopup = window.is_tpopup;
var is_mp_ui = !window.is_tpopup;
var animation_time = 300;
var $header_status, is_unblocking;

function get_tab_id(){ return E.be_tabs&&E.be_tabs.get('active.id'); }
function status_clr(){ status_set(); }
function status_set(s){
    zerr.notice('tab:%d status_set %s', get_tab_id(), s);
    if (!$header_status)
        return;
    $header_status.find('.header_status_text').text(s);
    if (!s)
        $header_status.hide();
    else
        $header_status.show();
}

function ff_dropdown_resize_cb(){
    var opened = $('.dropdown.open').length||$('.navbar-nav li.open').length;
    if (!opened)
        $('.f_ff_dropdown_fixup').remove();
    else if (!$('.f_ff_dropdown_fixup').length)
        $('<div>', {class: 'f_ff_dropdown_fixup'}).appendTo($('body'));
    ff_dropdown_resize();
}

/* XXX arik/bahaa BACKWARD: ugly hack to fix popup resize on ff. the dropdown
 * is absulte position and in firefox we have a bug where it doesn't take
 * absolute elements into account when resizing the popup */
function ff_dropdown_resize(){
    if (chrome || version_util.cmp(be_util.version(), '1.2.726')>=0)
        return;
    setTimeout(ff_dropdown_resize_cb, 500);
}

function g_switch_cb(){
    // XXX alexeym: unify this check with similar in ui_popup_ext.js
    if (E.be_ext.get('ext.conflict'))
        return;
    zerr.notice('tab:%d on/off clicked', get_tab_id());
    set_user_cmd({label: 'g_switch', cmd: 'on_off', country: ''});
}

E.get_enabled_rule = function(){
    var rules = be_vpn_util.get_rules(E.be_rule.get('rules'), E.get_url());
    if (!rules || !rules[0] || !rules[0].enabled || !E.be_ext.get('r.vpn.on'))
        return null;
    return rules[0];
};

E.get_rule = function(proxy_country){
    var all_rules = be_vpn_util.get_all_rules({proxy_country: proxy_country,
        rules: E.be_rule.get('rules'), url: E.get_url(),
        root_url: E.get_root(), rule_ratings: E.get('rule_ratings'),
        groups: E.get('rule_ratings.groups')});
    return all_rules && all_rules[0];
};

function msg_handler(msg){
    // no origin check, this message triggered for site on-click
    // to close tpopup
    if (msg.data && msg.data.id=='cs_tpopup.hide_anim')
        $('body').addClass('hide_anim');
}

function bext_config_update(){
    if (version_util.cmp(be_util.version(), '1.115.359')<=0)
        return;
    E.be_vpn.ecall('force_bext_config_update', []);
}

E.init = function(ui_popup){
    if (E.inited)
        return;
    window.addEventListener('message', msg_handler, false);
    E.on('destroy', function(){
        E.sp.return();
        var be_bg_main;
        if (be_bg_main = window.popup_main&&window.popup_main.be_bg_main)
            be_bg_main.fcall('dump_log', [zerr.log]);
        window.removeEventListener('message', msg_handler, false);
        uninit_monitor_active();
    });
    E.inited = true;
    E.sp = etask('be_ui_vpn', [function(){ return this.wait(); }]);
    E.ui_popup = ui_popup;
    E.R = ui_popup.R;
    E.be_vpn = ui_popup.be_vpn;
    E.be_tpopup = E.be_vpn.be_tpopup;
    E.be_rule = ui_popup.be_rule;
    E.be_info = ui_popup.be_info;
    E.be_tabs = ui_popup.be_tabs;
    E.be_ext = ui_popup.be_ext;
    E.be_svc = ui_popup.be_svc;
    E.be_mode = ui_popup.be_mode;
    E.be_premium = ui_popup.be_premium;
    E.conf = E.R.get('conf');
    ff_dropdown_resize();
    pcountries.add_il();
    init_footer();
    init_status();
    init_state();
    init_country();
    init_verify_proxy();
    init_tpopup();
    E.be_rule.trigger('fetch_rules');
    // XXX arik NOW: review all listeners below
    E.on_init('change:country change:active.root_url', _.debounce(E.ui_init));
    E.on_init('change:country change:active.url', _.debounce(rule_rating_cb));
    E.on('change:status', _.debounce(busy_slow_cb));
    E.listen_to(E.be_tabs, 'change:active.status', loading_site_slow_cb);
    E.on('change:active.user_url', active_url_cb);
    E.on('change:force_premium_rule', E.render);
    E.listen_to(E.be_tabs, 'change:active.url', active_url_cb);
    E.listenTo(E.be_tabs, 'completed error_occured', function(info){
        if (!info || !info.tabId)
            return;
        var fix_task = fix_tasks[info.tabId];
        if (!fix_task)
            return;
        if (!fix_task.fix_waiting)
            return;
        fix_task.continue();
    });
    E.listenTo(E.be_info, 'change:status', status_cb);
    E.listenTo(E.be_rule, 'change:status', status_cb);
    E.listenTo(E.be_info, 'change:status_opt', status_cb);
    E.listenTo(E.be_rule, 'change:status_opt', status_cb);
    E.listenTo(E.be_ext, 'change:is_premium', update_footer);
    setTimeout(function(){
        E.on_init('change:state change:status change:rule_ratings.root_url '+
            'change:rule_ratings.groups change:unblocking_rate', E.render);
        E.listenTo(E.be_rule, 'change:verify_proxy_ret', E.render);
        E.listenTo(E.be_tabs, 'change:active.status', E.render);
    }, 10);
    render_warnings();
    add_user_nav();
    $('#g_switch').click(g_switch_cb);
    E.on('destroy', function(){ $('#g_switch').off('click', g_switch_cb); });
    bext_config_update();
    init_monitor_active();
};

E.ui_init = function(){
    set_user_cmd({label: 'ui_init', cmd: '', country: '', no_busy: true});
    return etask([function(){
        return get_force_premium_rule();
    }, function(rule){
        E.set('force_premium_rule', rule);
    }]);
};

function init_monitor_active(){
    var data = storage.get_json('monitor_active')||{};
    data.ui_open_ts = Date.now();
    storage.set_json('monitor_active', data);
}

function uninit_monitor_active(){
    var data = storage.get_json('monitor_active')||{};
    data.ui_close_ts = Date.now();
    storage.set_json('monitor_active', data);
}

var update_status = function(){
    var prev = E.get('status');
    var s1 = E.be_rule.get('status'), s2 = E.be_info.get('status');
    var _new = [s1, s2].includes('error') ? 'error' :
        [s1, s2].includes('busy') ? 'busy' : 'ready';
    zerr.notice('tab:%d status %s > %s (%s %s)', get_tab_id(), prev, _new, s1,
        s2);
    E.set({prev_status: prev, status: _new,
        status_opt: E.be_rule.get('status_opt')||E.be_info.get('status_opt')});
};
var status_cb = _.debounce(update_status);

function busy_slow_cb(){
    busy_slow_cb.timer = clearTimeout(busy_slow_cb.timer);
    if (E.get('status')!='busy')
        return;
    // XXX arik: need to reduce time
    busy_slow_cb.timer = setTimeout(function(){
        be_popup_lib.perr_err({id: 'be_ui_vpn_busy_slow'});
        busy_slow_cb.timer = setTimeout(function(){
            be_popup_lib.perr_err({id: 'be_ui_vpn_busy_very_slow'});
        }, 13*SEC);
    }, 7*SEC);
}

function loading_site_slow_cb(){
    if (!chrome) // XXX arik/bahaa: add tab status support for firefox
        return;
    loading_site_slow_cb.timer = clearTimeout(loading_site_slow_cb.timer);
    if (E.be_tabs.get('active.status')=='complete')
        return;
    loading_site_slow_cb.timer = setTimeout(function(){
        delete loading_site_slow_cb.timer;
        var r = E.get_enabled_rule();
        if (!r)
            return;
        be_popup_lib.perr_err({id: 'be_ui_vpn_loading_slow', info: {
            root_url: E.get_root(), url: E.get_url(),
            rule: {name: r.name, country: r.country}}});
    }, 15*SEC);
}

function active_url_cb(){
    var prev = E.get_root();
    var tpopup_url = window.hola && window.hola.tpopup_opt &&
        window.hola.tpopup_opt.url;
    var qs = !is_tpopup && (zurl.parse(window.top.location.href).search||'');
    var url = tpopup_url || E.get('active.user_url') ||
        qs && zurl.qs_parse(qs).url || E.be_tabs.get('active.url') || '';
    E.set({'active.url': url, 'active.root_url': svc_util.get_root_url(url)});
    if (prev && prev!=E.get_root() && !E.get('active.user_url'))
    {
        var info = {root_url: E.get_root(), root_url_prev: prev,
            ext_enabled: E.be_ext.get('r.ext.enabled')};
        if (window.hola)
            info.t = Date.now()-window.hola.t.l_start;
        be_popup_lib.perr_err({id: 'be_ui_vpn_root_url_changed', info: info});
    }
}

// XXX arik/eilam: need test
E.get_url = function(){ return E.get('active.url')||''; };
E.get_root = function(){ return E.get('active.root_url')||''; };
E.get_host = function(){ return zurl.get_host(E.get_url()); };

function set_active_url(host, country, disable){
    var url = '';
    zerr.debug('tab:%d set_active_url %s %s', get_tab_id(), host, country);
    return etask([function(){
        return show_force_premium({country: country, root_url: host,
            on_trial: on_trial_start});
    }, function(is_shown){
        if (is_shown)
            return this.return();
        // XXX arik bug: rule_ratings_cb may be called twice in this scenrio
        // (once we call explicity and one auto-called by change:active.url
        return rule_rating_cb();
    }, function(){
        var popular = get_popular_country(host);
        country = country || popular[0].proxy_country;
        if (!disable && !check_before_unblock(host, country))
            return this.return();
        url = get_unblock_url(host, country);
        E.set('active_url', url);
        E.set('navigating_to', {host: host, country: country});
    }, function(){
        if (E.get('status')!='busy')
            return;
        E.once('change:status', this.continue_fn());
        return this.wait(5*SEC);
    }, function catch$(err){
        zerr.notice('tab:%d set_active_url err, %s', get_tab_id(), err);
        be_popup_lib.perr_err({id: 'be_set_active_url_err', info: url,
            err: err});
    }, function(){
        B.tabs.update(get_tab_id(), {url: url, active: true});
    }]);
}

function init_search(search_container, opt){
    var country = (E.get('country')||'us').toLowerCase();
    var s = new search.search({country: country,
        settings: assign({}, opt,
        {no_redir: true, suggest_remote: E.conf.url_ccgi+
            '/autocomplete?src_country='+(country||'us')+'&search=%QUERY'}),
        on_select: function(d){
            d = zurl.parse(d).host;
            if (!zurl.is_valid_domain(d))
                return E.set('active.user_url', '');
            s.$input.blur();
            set_active_url(d);
            be_popup_lib.perr_ok({id: 'be_search', info: d});
    }});
    s.render(search_container);
    return s;
}

function get_unblocking_rate(){
    var limit = 6;
    return etask([function(){
        return E.be_info.ecall('get_unblocking_rate', [limit]);
    }, function(unblocking_rate){ E.set('unblocking_rate', unblocking_rate);
    }]);
}

function rule_rating_cb(){
    var root_url, rule_ratings;
    return etask([function(){
        if (!E.get('country'))
            return this.return();
        root_url = E.get_root();
        if (E.skip_url())
            return this.return(get_unblocking_rate());
        if (E.get('rule_ratings.root_url')==root_url)
            return this.return();
        var rule_enabled = E.get_enabled_rule();
        return E.be_rule.ecall('get_rule_ratings',
            [{root_url: root_url, src_country: E.get('country'), limit: 20,
            proxy_country: rule_enabled&&rule_enabled.country,
            vpn_only: true}]);
    }, function(ratings){
        rule_ratings = ratings;
        E.set({rule_ratings: ratings, 'rule_ratings.root_url': root_url});
        if (!ratings)
            return this.return();
        return E.be_rule.ecall('get_groups_from_ratings', [ratings]);
    }, function(groups){
        // XXX arik: add groups, don't replace
        E.set({'rule_ratings.groups': groups});
        if (!rule_ratings||!groups)
            return;
        rule_ratings.forEach(function(country_ratings){
            _.forEach(country_ratings.rules, function(r){
                if (r.rating<=0||!groups)
                    return;
                if (!svc_util.find_rule(groups.unblocker_rules, r))
                {
                    be_popup_lib.perr_err({id: 'be_ui_vpn_rating_no_rule',
                        info: {rule: r, ratings: rule_ratings,
                        groups: groups}});
                    return;
                }
            });
        });
    }, function catch$(err){
        E.set({rule_ratings: undefined, 'rule_ratings.root_url': root_url});
        be_popup_lib.perr_err({id: 'be_ui_vpn_rule_ratings_err', err: err,
            info: root_url});
    }]);
}

E.set_err = function(id, err){
    E.set('error', id);
    E.ui_popup.set_err(id, err);
};

function init_footer(){
    var cb = _.debounce(function(){
        E.footer_inited = true;
        update_footer();
    });
    E.listenTo(E.be_rule, 'change:rules', cb);
    E.on_init('change:active.url', cb);
}

function init_status(){
    // XXX arik: loader is annoying and jumpy. we will show
    // status instead
    return;
    if (!E.loader)
    {
        var $status = $('<div>', {class: 'popup-status'});
        E.loader = new loader_view_class();
        E.loader.render($status);
        $status.insertBefore('#popup');
    }
    var loader_options = {timeout: 15*SEC};
    var cb = _.debounce(function(){
        if (!E.loader)
            return;
        var verify_proxy_ret = E.be_rule.get('verify_proxy_ret')||{};
        var ui_status = E.get('ui_status');
        var loading = chrome && E.be_tabs.get('active.status')!='complete'
            ||E.redirect_page();
        if (E.get('hide_loader'))
            E.loader.stop(true);
        else if (E.get('status')=='busy' || ui_status=='busy')
            E.loader.start(loader_options);
        else if (verify_proxy_ret.error && E.get('state')=='enable')
            E.loader.finish();
        else if (loading && E.get('state')=='enable')
            E.loader.start(loader_options);
        else
            E.loader.finish();
    });
    E.on_init('change:status change:status_opt change:ui_status '+
        'change:ui_status_opt change:state change:hide_loader', cb);
    E.listenTo(E.be_rule, 'change:verify_proxy_ret', cb);
    E.listenTo(E.be_tabs, 'change:active.status', cb);
}

function update_footer(){
    if (!E.footer_inited || !E.is_visible)
        return;
    var rule_enabled = E.get_enabled_rule();
    var root_url = rule_enabled ? E.get_root() : null;
    var $td;
    $td = $('#footer .r_ui_premium').empty();
    $('<a>', {href: 'https://hola.org/access/popular', target: '_blank'})
    .text(T('Popular sites')).appendTo($td);
    $('#content').show();
    if (!is_tpopup)
    {
        $('#footer .popup-footer-content').empty().append(
            (new ext_promo_view_class()).render().$el);
    }
    if (is_mp_ui)
        return;
    $td = $('#footer .r_ui_share').empty();
    add_footer_sharing($td, root_url, rule_enabled);
}

function add_footer_sharing($td, root_url, rule_enabled){
    var link = get_sharing_link(rule_enabled);
    be_social.init_globals(root_url, E.get('country'), link);
    E.social_sharing = new be_social.SocialSharing({
        tooltip: false,
        mailto_frame: !!chrome,
        perr: function(id, share){
            be_popup_lib.perr_ok({id: id, info: assign({share: share,
                root_url: E.get_root(), url: E.get_url(),
                src_country: E.get('country').toLowerCase(),
                proxy_country:
                    (rule_enabled&&rule_enabled.country||'').toLowerCase()},
                _.pick(rule_enabled||{}, 'name', 'type', 'md5'))});
        }
    });
    $td.prepend(E.social_sharing.$el);
}

function get_unblock_url(domain, country){
    domain = domain || '';
    country = (country || '').toLowerCase();
    return domain ? 'https://hola.org/access/'+domain+'/using/vpn-'+country+
        '?go=2' : get_popular_url();
}

function get_sharing_link(rule_enabled){
    var root_url = E.get_root();
    var link = 'https://hola.org/access/popular';
    var rule = rule_enabled;
    if (rule)
    {
        // XXX arik: reuse www/pub/unblock_util.js:E.rule_unblock_url
        link = 'https://hola.org/access/'+root_url+'/using/vpn-'
        +rule.country.toLowerCase();
    }
    return link;
}

var user_status_model = Backbone.Model.extend({
    initialize: function(options){
        var _this = this;
        this.options = options||{};
        var be_premium = this.options.be_premium;
        E.listenTo(E.be_ext, 'change:is_premium', this._refresh.bind(this));
        etask([function(){ return _this._refresh(); }, function(user){
            if (user)
                be_premium.fcall('refresh_user', [{force_premium: true}]);
        }]);
    },
    _refresh: function(){
        var _this = this;
        var be_premium = this.options.be_premium;
        return etask([function(){
            if (be_premium)
                return be_premium.get('user');
        }, function(user){
            _this.update(user);
            return user;
        }]);
    },
    update: function(user){
        var _this = this, is_member, be_premium = _this.options.be_premium;
        return etask([function(){
            if (!user)
            {
                _this.clear();
                _this.set('is_found', 0);
                return this.return();
            }
            _this.set('is_found', 1);
            return be_premium ? be_premium.ecall('is_active') : null;
        }, function(_is_member){
            is_member = _is_member;
            return be_premium ? be_premium.ecall('is_paid') : null;
        }, function(is_paid){
            _this.set('display_name', user.displayName);
            _this.set('verified', user.verified);
            _this.set('hola_uid', user.hola_uid);
            _this.set('is_member', is_member);
            _this.set('is_paid', is_paid);
            _this.set('email', zutil.get(user.emails, '0.value'));
            E.be_ext.set('hola_uid', user.hola_uid);
        }]);
    }
});

var menu_account_view = Backbone.View.extend({
    tagName: 'div',
    className: 'popup-header-menu-account',
    template: zdot.template(menu_account_template),
    template_products: zdot.template(menu_products_template),
    events: {'click .log-out button': 'on_logout'},
    initialize: function(){
        this.listenTo(this.model, 'change', this.render); },
    render: function(){
        this.$el.html(this.template({
            T: T,
            display_name: this.model.get('display_name'),
            is_premium: this.model.get('is_member'),
            email: this.model.get('email'),
            products: this.template_products({T: T, origin: 'menu-account'}),
        }));
        return this;
    },
    on_logout: function(){
        var _this = this;
        return etask([function(){
            if (window.is_local_tpopup && E.be_premium)
                return E.be_premium.fcall('logout_user');
            return ajax.hola_api_call('users/logout/inline', {method: 'POST',
                text: true});
        }, function(){ return E.be_premium.fcall('refresh_user'); },
        function(){ _this.model.update(); }]);
    },
});

var menu_view = Backbone.View.extend({
    tagName: 'div',
    className: 'popup-header-controls-item',
    template: zdot.template(menu_template),
    template_products: zdot.template(menu_products_template),
    events: {
        'click .popup-header-controls-button': 'on_toggle',
        'click .l_menuitem_lang a': 'on_lang',
        'click .menu-item-settings a': 'on_settings',
        'click .menu-item-about a': 'on_about',
        'click .user-info': 'on_account',
    },
    initialize: function(options){
        this.menu_account = new menu_account_view({model: this.model});
        this.options = options||{};
        this.listenTo(this.model, 'change', this.render);
        if (version_util.cmp(be_util.version(), '1.2.672')>=0)
            this.$el.addClass('pull-right');
        this.render();
    },
    render: function(){
        var display_name = this.model.get('display_name');
        var is_lang = version_util.cmp(be_util.version(), '1.2.672')>=0;
        // 'jQuery.html()' removes child elements with their events, sub view
        // events got removed, so we use 'innerHtml'
        this.el.innerHTML = this.template({
            T: T,
            display_name: display_name,
            is_lang: is_lang,
            is_about: version_util.cmp(be_util.version(), '1.2.661')>=0,
            is_premium: this.model.get('is_member'),
            products: this.template_products({T: T, origin: 'menu'}),
        });
        if (is_lang)
        {
            if (this.lang_list)
                this.lang_list.remove();
            this.lang_list = new be_ui_obj.lang_list({label:
                this.$el.find('.l_menuitem_lang a')});
            $('body').append(this.lang_list.$el);
        }
        this.$menu_icon = this.$el.find('.popup-header-controls-button');
        this.$menu = this.$el.find('.popup-header-menu');
        this.$general = this.$el.find('.popup-header-menu-general');
        this.$account = this.menu_account.render().$el.appendTo(this.$menu);
        if (this.is_opened && !display_name)
        {
            this.$account.hide();
            this.$general.show();
        }
    },
    on_account: function(e){
        e.stopPropagation();
        this.$general.hide();
        this.$account.show();
    },
    on_about: function(e){
        e.preventDefault();
        var url = 'about.html';
        if (version_util.cmp(be_util.version(), '1.12.422')<0)
            url = 'be_about.html';
        be_util.open_be_tab({url: url});
    },
    on_settings: function(e){
        e.preventDefault();
        this.options.settings_handler();
    },
    on_lang: function(e){
        e.preventDefault();
        e.stopPropagation();
        this.$general.hide();
        this.lang_list.toggle();
    },
    on_toggle: function(e){
        e.stopPropagation();
        var _this = this;
        this.$el.toggleClass('open');
        this.is_opened = this.$el.hasClass('open');
        if (!this.is_opened)
        {
            this.$account.hide();
            this.$general.hide();
        }
        else
            this.$general.show();
        this.$menu_icon.toggleClass('hamburger-active', this.is_opened);
        var $body = $('body');
        $body.toggleClass('header-menu-opened', this.is_opened);
        if (this.is_opened)
        {
            $body.on('click.header-menu', function(ev){
                if (!ev || !ev.target ||
                    !$(ev.target).closest('.popup-header-menu').length)
                {
                    _this.$menu_icon.trigger('click');
                }
            });
        }
        else
            $body.off('click.header-menu');
        $('.lang_dropdown_toggle').parent().removeClass('open');
    },
    remove: function(){
        $('body').removeClass('header-menu-opened');
        $('.l_ui_obj_lang_list').remove();
        this.menu_account.remove();
        Backbone.View.prototype.remove.call(this);
    }
});

function plus_ref(ref, extra){
    return zescape.uri('https://hola.org/plus', assign({ref: ref}, extra));
}

var premium_dialog_view = be_backbone.view.extend({
    tagName: 'div',
    className: 'country-premium-dialog f64',
    template: zdot.template(country_premium_template),
    events: {'click .subscribe': '_on_subscribe'},
    render: function(){
        var _this = this;
        this.$el.html(this.template({
            country: this.options.country,
            site: E.get_root(),
        }));
        this.options.$parent.append(this.$el);
        this.options.$parent.addClass('dialog-opened');
        this.options.$parent.on('click.premium-dialog', function(e){
            if ($(e.target).closest(_this.el).length)
                return;
            _this.remove();
        });
        return be_backbone.view.prototype.render.call(this);
    },
    _on_subscribe: function(){
        var _this = this;
        etask([function(){
            return be_popup_lib.perr_ok({id: 'be_rule_premium', info: {
                domain: E.get_root(),
                country: _this.options.country,
                url: E.get_url(),
            }});
        }, function(){
            // XXX sergeir: use plus_ref
            E.ui_popup.open_page('https://hola.org/plus'
            +'?ref=holaext-country-premium-dialog-'+_this.options.country
            +'&utm_source=holaext'
            +'&utm_content=country-premium-dialog-'+_this.options.country);
        }]);
    },
    remove: function(){
        this.options.$parent.removeClass('dialog-opened');
        this.options.$parent.off('click.premium-dialog');
        be_backbone.view.prototype.remove.call(this);
    },
});

function new_user_nav(opt){
    var user_status = opt.user_status;
    var be_bg_main = window.popup_main&&window.popup_main.be_bg_main;
    var nav = new menu_view({model: user_status,
        settings_handler: opt.settings_handler});
    if (be_bg_main)
        nav.listenTo(be_bg_main, 'change:is_svc', nav.render.bind(nav));
    return nav;
}

var upgrade_link_view = be_backbone.view.extend({
    tagName: 'div',
    className: 'upgrade-link',
    template: zdot.template('<a href="{[=it.href]}" '+
        'class="{[= it.is_renew ? "renew" : "upgrade"]}">'+
        '{[= it.is_renew ? it.T("Renew") : it.T("Upgrade")]}</a>'),
    events: {'click a': '_on_click'},
    initialize: function(opt){
        this._ref = 'ext_upgrade';
        this.model = opt.user_status;
        this.listenTo(this.model, 'change', this.render);
        this.render();
    },
    render: function(){
        var is_member = this.model.get('is_member');
        var is_pending = this.model.get('is_pending');
        var is_paid = this.model.get('is_paid');
        var is_trial = this.model.get('is_trial');
        if (is_member&&!is_trial || is_member&&is_paid || is_pending)
            return void this.$el.html('');
        this.$el.html(this.template({
            T: T,
            href: plus_ref(this._ref),
            is_renew: is_paid,
        }));
    },
    _on_click: function(){
        E.ui_popup.open_page(plus_ref(this._ref));
    },
});

function add_user_nav(){
    var user_status = E.ui_popup.nav && E.ui_popup.nav.model ||
        new user_status_model({be_premium: E.be_premium});
    var nav = new_user_nav({be_premium: E.be_premium,
        user_status: user_status, settings_handler: E.ui_popup.open_settings});
    var upgrade_link = new upgrade_link_view({user_status: user_status});
    E.on('destroy', function(){
        nav.remove();
        upgrade_link.remove();
    });
    if (window.popup_main && window.popup_main.uninit_user_nav)
        window.popup_main.uninit_user_nav();
    if (E.ui_popup.nav)
        E.ui_popup.nav.remove();
    E.ui_popup.nav = nav;
    E.mode_listening = false;
    $('#header .popup-header-controls-left').prepend(nav.$el);
    $('#header .popup-header-controls-right').append(upgrade_link.$el);
    $('#header').append($(
        '<div id=header_status class=header_status>'+
        '  <div class=header_status_text></div>'+
        '</div>'));
    $header_status = $('#header_status').hide();
}

function set_country_rule(proxy_country, disable, rule_enabled){
    var root_url = E.get_root();
    if (!disable && !check_before_unblock(root_url, proxy_country))
        return;
    return etask([function(){
        return show_force_premium({country: proxy_country, disable: disable,
            root_url: root_url, on_trial: on_trial_start});
    }, function(is_shown){
        if (is_shown)
            return this.return();
        proxy_country = proxy_country.toLowerCase();
        var cmd = disable ? 'disable' : 'enable';
        if (!disable)
        {
            if (rule_enabled && rule_enabled.country==proxy_country)
                return this.return();
            var rule;
            if (!(rule = E.get_rule(proxy_country)))
                return set_active_url(root_url, proxy_country);
            set_user_cmd({label: 'set_country_enable', cmd: cmd,
                country: proxy_country, name: rule.name, no_busy: true,
                state: 'connecting'});
            E.set('navigating_to', {host: root_url, country: proxy_country});
            is_unblocking = true;
            return E.script_set(rule, {enabled: true, root_url: root_url,
                wait: 3*SEC, max_wait: 10*SEC});
        }
        set_user_cmd({label: 'set_country_disable', cmd: cmd,
            country: proxy_country, no_busy: !rule_enabled});
        if (!rule_enabled)
        {
            be_popup_lib.perr_err({id: 'be_ui_vpn_set_country_nothing',
                info: {proxy_country: proxy_country, disable: disable,
                name: rule_enabled&&rule_enabled.name}});
        }
        else
        {
            return E.script_set(rule_enabled, {enabled: false,
                root_url: root_url});
        }
    }, function catch$(err){ E.set_err('be_ui_vpn_set_country_rule', err);
    }, function finally$(){
        is_unblocking = false;
        state_cb();
    }]);
}

function get_popular_country(host){
    return be_vpn_util.get_popular_country({host: host||E.get_host(),
        rule_ratings: !host&&E.get('rule_ratings')});
}

function set_working(){
    var rule_enabled = E.get_enabled_rule();
    var root_url = E.get_root();
    /* XXX arik: need limit on number of entries */
    var j = storage.get_json('vpn_working')||{};
    j[root_url] = {working: 1, name: rule_enabled.name};
    storage.set_json('vpn_working', j);
    refresh_sharing();
}

function clr_working(){
    var root_url = E.get_root();
    var j = storage.get_json('vpn_working')||{};
    delete j[root_url];
    storage.set_json('vpn_working', j);
    refresh_sharing();
}

function is_working(){
    var root_url = E.get_root();
    var rule_enabled = E.get_enabled_rule();
    var j = (storage.get_json('vpn_working')||{})[root_url];
    return rule_enabled && j && j.working && j.name==rule_enabled.name;
}

function refresh_sharing($o){
    if (is_working())
    {
        $('.sharing-obj').show();
        if ($o)
            $o.show();
    }
    else
    {
        $('.sharing-obj').hide();
        if ($o)
            $o.hide();
    }
}

function init_state(){
    var cb = _.debounce(state_cb);
    E.on_init('change:user.cmd change:user.country change:status '+
        'change:active.root_url change:country', cb);
    E.listenTo(E.be_rule, 'change:rules', cb);
    E.listenTo(E.be_ext, 'change:r.vpn.on', cb);
}

function init_verify_proxy(){
    var cb = _.debounce(function(){
        var rule_enabled = E.get_enabled_rule();
        if (E.get('user.cmd')||rule_enabled)
        {
            E.off('change:user.cmd', cb);
            E.stopListening(E.be_rule, 'change:rules', cb);
        }
        if (!E.get('user.cmd') && rule_enabled)
            E.verify_proxy(rule_enabled, 'popup_open');
    });
    E.on_init('change:user.cmd', cb);
    E.listenTo(E.be_rule, 'change:rules', cb);
}

// XXX alexeym: merge with be_ui_mp & move into be_ui_popup_ext
function on_close_button(e){
    if (e)
        e.stopPropagation();
    if (!E.ui_popup)
    {
        if (is_tpopup)
            parent.postMessage({id: 'tpopup.close'}, '*');
        return;
    }
    if (!is_tpopup)
        return E.ui_popup.close_popup();
    E.ui_popup.set_dont_show_again({root_url: E.get_root(),
        period: 'session', src: 'x_btn',
        tab_id: window.hola.tpopup_opt.tab_id,
        type: window.hola.tpopup_opt.type});
}

function init_tpopup(){
    if (!is_tpopup)
        return;
    // XXX arik/mark: need proper tooltip api and mv styles to css
    var $el, $hint, timer;
    var root_url = E.get_root();
    // XXX sergeir: reuse close_button from ui_obj
    function dont_show_for_current_url(e){
        e.stopPropagation();
        E.ui_popup.set_dont_show_again({root_url: root_url, src: 'x_tooltip',
            period: 'default', type: window.hola.tpopup_opt.type});
    }
    function dont_show_for_all(e){
        e.stopPropagation();
        E.ui_popup.set_dont_show_again({root_url: 'all', period: 'default',
            src: 'x_tooltip', type: window.hola.tpopup_opt.type});
    }
    $el = $('#tpopup_close').off('click mouseenter mouseleave');
    $hint = $('#tpopup_close_hint').on({mouseenter: function(){
        timer = clearTimeout(timer);
        $hint.fadeIn();
    }, mouseleave: function(){
        timer = setTimeout(function(){ $hint.fadeOut(); }, animation_time);
    }});
    $el.on({click: on_close_button,
        mouseenter: function(){
            var new_root_url = E.get_root();
            timer = clearTimeout(timer);
            if (root_url!=new_root_url)
            {
                root_url = new_root_url;
                $hint.empty();
                $('<div>', {class: 'hint_dont_show'})
                .text(T('Don\'t show again')).appendTo($hint);
                $('<div>', {class: 'hint_option'})
                .html(T('for <b>$1</b> for one week', [root_url]))
                .click(dont_show_for_current_url).appendTo($hint);
                $('<div>', {class: 'hint_option'}).click(dont_show_for_all)
                .html(T('for <b>any site</b> for one week')).appendTo($hint);
            }
            $hint.fadeIn();
        },
        mouseleave: function(){
            timer = setTimeout(function(){ $hint.fadeOut(); },
                animation_time);
        }
    });
}

function init_country(){
    var sent_perr;
    E.on('destroy', function(){
        init_country.timer = clearTimeout(init_country.timer); });
    E.listen_to(E.be_info, 'change:location', function location_cb(){
        var loc = E.be_info.get('location');
        var c = loc&&loc.country;
        E.set('country', c||'');
        if (!c)
            return;
        E.stopListening(E.be_info, 'change:location', location_cb);
        init_country.timer = clearTimeout(init_country.timer);
        if (E.get('country')&&sent_perr)
        {
            be_popup_lib.perr_err({id: 'be_ui_vpn_no_country_recover',
                info: {country: E.get('country')}});
        }
    });
    init_country.timer = setTimeout(function(){
        if (!E.get('country')&&!sent_perr)
        {
            sent_perr = true;
            be_popup_lib.perr_err({id: 'be_ui_vpn_no_country',
                info: {url: E.get_url(),
                be_info: {country: E.be_info.get('country'),
                    location: E.be_info.get('location')},
                status: {
                    rmt: E.R.get('status')+' '+
                        (E.R.get('inited') ? 'inited' : 'not_inited'),
                    be_vpn: E.be_vpn.get('status'),
                    be_rule: E.be_rule.get('status'),
                    be_info: E.be_info.get('status'),
                }
            }});
        }
    }, 3*SEC);
}

// XXX arik: need test
function state_cb(){
    var rule_enabled = E.get_enabled_rule();
    var redirect_page = E.redirect_page();
    var curr = E.get('state'), next;
    var status = E.get('status');
    var cmd = E.get('user.cmd'), user_opt = E.get('user.opt');
    var info = {state: curr, url: E.get_url(), root_url: E.get_root(),
        prev_url: E.get('prev_url'), prev_root: E.get('prev_root'),
        user_opt: user_opt, status: status};
    if (redirect_page)
        rule_enabled = redirect_page;
    if (rule_enabled)
    {
        info.name = rule_enabled.name;
        info.country = rule_enabled.country;
    }
    if (E.skip_url())
        next = 'skip_url';
    else if (status=='error')
        next = 'error';
    else if (is_unblocking && rule_enabled)
        next = curr;
    else if ({enable: 1, disable: 1}[cmd])
        next = cmd;
    else if (rule_enabled||redirect_page)
        next = 'enable';
    else
        next = E.get('active.url') ? E.get('state') : 'disable';
    E.set('prev_url', E.get_url());
    E.set('prev_root', E.get_root());
    E.set('state', next);
    if (curr!=next)
        zerr.notice('tab:%d state %s > %s', get_tab_id(), curr, next);
    if (status!='busy')
    {
        var send_perr;
        info.next = next;
        info.ext_enabled = E.be_ext.get('r.ext.enabled');
        if (rule_enabled)
        {
            info.rule_enabled = {name: rule_enabled.name,
                country: rule_enabled.country};
        }
        if (cmd=='enable'&&!rule_enabled)
            send_perr = true;
        if (cmd=='disable'&&rule_enabled)
            send_perr = true;
        if (cmd=='enable' && rule_enabled &&
            rule_enabled.country!=user_opt.country.toLowerCase())
        {
            send_perr = true;
            info.mismatch_country = rule_enabled.country;
        }
        // XXX arik NOW: send perr if root_url doesn't match current rule
        if (send_perr)
        {
            if (window.hola)
                info.t = Date.now()-window.hola.t.l_start;
            be_popup_lib.perr_err({id: 'be_ui_vpn_state_mismatch_user_action',
                info: info});
        }
    }
}

// XXX arik/eilam: need test
E.skip_url = function(){
    var url = E.get_url();
    if (!url)
        return true;
    var protocol = zurl.get_proto(url);
    var host = E.get_host();
    return !E.get_root() || host.search(/^(.*\.)?hola.org$/)!=-1 &&
        url.search(/access\/([^/]*)\/using\/.*/) == -1 ||
        zurl.is_ip_port(host) || protocol.search(/^(http|https)$/)==-1 ||
        host=='localhost' || !zurl.is_valid_domain(host);
};

E.redirect_page = function(url){
    var redirect_regexp = /hola\.org\/access\/([^/]*)\/using\/vpn-([^?/]*)$/gi;
    var redirect_match = redirect_regexp.exec(E.get_url());
    if (!redirect_match)
        return;
    return {name: redirect_match[1], country: redirect_match[2]};
};

E.is_popular_page = function(url){
    var popular_regexp = /hola\.org\/access\/popular.*$/gi;
    url = url || E.get_url();
    return popular_regexp.test(url);
};

function set_ui_status(status, opt){
    if (status)
        return void E.set({ui_status: status, ui_status_opt: opt});
    E.unset('ui_status');
    E.unset('ui_status_opt');
}

// XXX arik: need generic hanlding of ui_status
E.change_proxy = function(rule, desc, not_working){
    return etask('change_proxy', [function(){
        set_ui_status('busy', {desc: 'Finding new peers...'});
        var verify_proxy_ret = E.be_rule.get('verify_proxy_ret')||{};
        return E.be_rule.ecall('change_proxy_wait', [{
            rule: rule, desc: desc, root_url: E.get_root(),
            zgettunnels_retry: be_defines.ZGETTUNNELS_RETRY,
            verify_proxy_ret: verify_proxy_ret,
            user_not_working: not_working}]);
    }, function(ret){
        // XXX arik/shachar hack: temporary hack till fixing tab_unblocker
        // to reload relevant tabs after zagent update
        B.tabs.reload(get_tab_id());
    }, function finally$(){ set_ui_status();
    }, function catch$(err){
        be_popup_lib.perr_err({id: 'be_change_proxy_err', err: err});
    }]);
};

E.verify_proxy = function(rule, desc){
    return etask('verify_proxy', [function(){
        set_ui_status('busy', {desc: 'Testing connection...'});
        return E.be_rule.ecall('verify_proxy_wait', [{rule: rule,
            desc: desc, zgettunnels_retry: be_defines.ZGETTUNNELS_RETRY,
            root_url: E.get_root(), tab_id: get_tab_id()}]);
    }, function finally$(){ set_ui_status();
    }, function catch$(err){
        be_popup_lib.perr_err({id: 'be_verify_proxy_err', err: err});
    }]);
};

function render_warnings(){
    $('.r_warnings').remove();
    var $error_holder = $('#popup');
    var $el = $('<div>', {class: 'r_warnings'}).insertBefore($error_holder);
    var $msg, br_ver = user_agent.guess_browser().version;
    var ff_upgrade = !chrome && version_util.cmp(br_ver, '43')<0;
    if (ff_upgrade)
    {
        $msg = $('<div>', {class: 'r_ui_vpn_compat'})
        .appendTo($el).append($('<span>'+
            T('Old version of Firefox. Press <a>here</a> to upgrade.')
            +'</span>'),
            $('<div>').text(T(
                '(some Hola features are not available on your version)')));
        $msg.find('a').attr('target', '_blank').attr('href',
            'http://www.mozilla.org/en-US/firefox/update/');
    }
}

function $new_popular_block(p){
    var custom_icon = p.root_url.replace(/\./g, '-');
    var $ret = $('<div>', {class: 'popup-popular-item', title: p.root_url})
    .click(function(){
        var is_mac = B.os == 'macos';
        if (!is_mac || !E.is_popular_page())
            return set_active_url(p.root_url);
        perr_event('popular_unblock_attempt', {
            info: {unblock_attempt_url: p.root_url}
        });
        return B.tabs.create({url: get_popular_url(), active: true});
    });
    var $icon_div = $('<i>', {class: 'popup-popular-item-image icon-'
        +custom_icon})
    .appendTo($ret);
    $('<span>', {class: 'popup-popular-item-name'}).text(p.root_url)
    .appendTo($ret);
    var icon = new Image();
    icon.src = zurl.add_proto(p.root_url)+'/favicon.ico';
    icon.className = 'popup-popular-item-icon';
    icon.onload = function(){ $icon_div.append(icon); };
    icon.onerror = function(){ $icon_div.addClass('icon-error'); };
    etask([function(){
        return E.be_premium && E.be_premium.ecall('get_force_premium_rule',
            [p.root_url, {ignore_install_version: true}]);
    }, function(is_ps){
        $ret.addClass(is_ps ? 'premium-site' : 'free-site'); }]);
    return $ret;
}

function get_popular_url(){
    var country = E.get('country');
    return 'https://hola.org/access/popular'+(country ? '/'+country : '')+
        '?utm_source=holaext';
}

var country_list_head_view_class = Backbone.View.extend({
    el: '<span>',
    initialize: function(options){
        var $el = this.$el;
        var opt = this.options = options||{};
        var size = 'f' + (opt.size ? opt.size : 'svg_4x3');
        var $a = $('<a>', {class: size}).appendTo($el);
        this.$flag = $('<span>', {class: 'flag'}).appendTo($a);
        this.$label = $('<div>', {class: 'r_list_head_label'}).appendTo($el);
    },
    render: function(opt){
        opt = opt||{};
        var c = opt.country ? opt.country.proxy_country : '';
        this.$flag.attr('class', 'flag')
        .addClass(c.toLowerCase()||'flag_other');
        if (this.options.fade_head)
            this.$flag.addClass('flag_fade');
        if (opt.show_plus_logo)
            this.$flag.addClass('show_plus_logo');
        else
            this.$flag.removeClass('show_plus_logo');
        var uc = c.toUpperCase();
        var label_text = uc && T(uc);
        this.$label.text(label_text||T('More...'));
    },
});

var country_list_item_template = zdot.template(country_list_item);

function get_country_list_item(c, disable){
    return country_list_item_template({
        T: T,
        country: c.proxy_country,
        name: c.name,
        type: c.type,
        disable: disable,
    });
}

function get_url_for_unsupported(opt){
    opt = opt||{};
    var type = opt.type, domain = opt.domain, country = opt.country;
    var ref = (opt.pref||'')+'unsupported_require_plus_'+
        domain.replace(/[^a-z]/g, '_');
    return zescape.uri(plus_ref(ref, {type: type, domain: domain,
        country: country}));
}

function unsupported_open(type, domain, country){
    var src_country = E.get('country').toLowerCase();
    var perr = type.replace(/-/g, '_');
    be_popup_lib.perr_ok({id: 'be_ui_vpn_click_unsupported_open_'+perr, info: {
        src: 'ext',
        browser: browser,
        root_url: domain,
        ext_ver: be_util.version(),
        url: E.get_url(),
        src_country: src_country,
        proxy_country: country,
        host: E.get_host()
    }});
    var url = get_url_for_unsupported({type: type, domain: domain,
        country: country});
    E.ui_popup.open_page(url);
}

// XXX colin/shachar: move google to be in blacklist
function is_google(root_url){
    return root_url.split('.')[0]=='google';
}

// XXX arik: ui.js <--> premium.js
function is_blacklist(root_url, host){
    if (E.be_ext.get('is_premium'))
        return false;
    // XXX colin: if blacklisted make sure to disable rule for root_url of url
    var blacklist = (E.be_rule.get('rules')||{}).blacklist||{};
    return is_google(root_url) || blacklist[host] || blacklist[root_url];
}

/**
 * @param host Full host name.
 * @param country Two-letter (ISO 3166-1 alpha-2) country code.
 * @returns {boolean} Whether we can start unblocking.
 */
function check_before_unblock(host, country){
    if (!E.be_ext.get('enable_unsupported'))
        return true;
    country = country.toLowerCase();
    var domain = svc_util.get_root_domain(host);
    if (domain.includes('hola.org'))
        return false;
    // XXX arik: rm code
    if (false && is_blacklist(domain, host))
    {
        unsupported_open('site', domain, country);
        return false;
    }
    else
        return true;
}

function hide_trial_timer(){
    if (!E.$countdown)
        return;
    $('body').removeClass('is-popup-trial-countdown');
    E.$countdown = void E.$countdown.remove();
}

function show_premium_popup(opt){
    if (E.premium_view_loading)
        return;
    // XXX sergeir: find when popup is deleted from DOM
    if (E.premium_view)
    {
        if (E.premium_view.$el.closest('body').length)
            return;
        E.premium_view.$el.remove();
        E.premium_view = undefined;
    }
    var root_url = opt.root_url || E.get_root();
    E.premium_view_loading = true;
    return etask([function(){
        // XXX sergeir: remove when all users will be updated
        if (version_util.cmp(be_util.version(), '1.109.233')<0)
            return false;
        return etask.all({
            rule: E.be_premium.ecall('get_force_premium_rule', [root_url]),
            trial_ended: E.be_premium.ecall('is_uuid_trial_ended', [root_url])
        });
    }, function(o){
        var rule = o.rule, trial_ended = o.trial_ended;
        if (!rule)
            return;
        zerr.notice('tab:%d premium popup should be shown', get_tab_id());
        E.set('premium_popup.trial_ended', trial_ended);
        E.set('premium_popup.root_url', root_url);
        E.set('state', 'premium_popup');
        return true;
    }, function catch$(e){
        be_popup_lib.perr_err({id: 'be_ui_vpn_show_premium_popup', err: e});
    }, function finally$(){ E.premium_view_loading = false;
    }]);
}

function start_trial_timer(root_url){
    if (E.trial_countdown)
        E.trial_countdown.return();
    E.trial_countdown = etask([function(){
        return E.be_premium.ecall('get_uuid_trial_active', [root_url]);
    }, function(trial){
        if (!trial)
            return hide_trial_timer();
        if (!(E.$countdown = $('.trial_countdown')) || !E.$countdown.length)
        {
            E.$countdown = $('<div>', {class: 'trial_countdown'});
            E.$countdown.insertAfter('#header');
        }
        return etask.interval(date.ms.SEC, [function(){
            var diff = trial.end-date();
            if (diff<0)
            {
                hide_trial_timer();
                return this.break();
            }
            E.$countdown.text(T('Free trial')+': '+date.ms_to_dur(diff));
        }]);
    }]);
}

function show_trial_popup(opt){
    opt = opt||{};
    var type, country = opt.country||'us';
    if (!E.curr_view || E.trial_view || E.trial_view_loading ||
        browser!='chrome' || !(E.be_ext.get('bext_config')||{})
        .trial_popup_enabled)
    {
        return;
    }
    if ((country = country.toLowerCase())!='us')
        return hide_trial_timer();
    var root_url = opt.root_url || E.get_root();
    start_trial_timer(root_url);
    E.trial_view_loading = true;
    return etask([function(){
        return E.be_premium.ecall('is_uuid_trial_available', [root_url]);
    }, function(is_available){
        if (!is_available)
            return E.be_premium.ecall('is_uuid_trial_ended', [root_url]);
        type = 'try_view_class';
        this.goto('trial_view');
    }, function(is_ended){
        if (!is_ended)
            return this.return();
        type = 'ended_view_class';
        $('body').addClass('is-popup-trial-ended-view');
        hide_trial_timer();
    }, function trial_view(){
        if (!type)
            return;
        zerr.notice('tab:%d trial %s - popup should be shown', get_tab_id(),
            type);
        var $curr_el = E.curr_view.$el;
        var hide_view = function(){
            E.unset('hide_loader');
            $curr_el.removeClass('g-hidden');
            $('body').removeClass('is-popup-trial-ended-view');
            E.trial_view.$el.remove();
            E.trial_view = undefined;
        };
        E.trial_view = new site_trial_ui[type]({
            root_url: root_url,
            be_premium: E.be_premium,
            be_info: E.be_info,
            be_tabs: E.be_tabs,
            be_rule: E.be_rule,
            be_ext: E.be_ext,
            on_try: hide_view,
        });
        E.set('hide_loader', true);
        $curr_el.after(E.trial_view.render().$el).addClass('g-hidden');
        return true;
    }, function catch$(e){
        be_popup_lib.perr_err({id: 'be_ui_vpn_show_trial_popup', err: e});
    }, function finally$(){ E.trial_view_loading = false;
    }]);
}

function is_trial_available(root_url, opt, on_succ, on_fail){
    var started;
    return etask([function(){
        return E.be_premium.ecall('is_uuid_trial_available', [root_url]);
    }, function(is_available){
        if (started = !is_available)
             return E.be_premium.ecall('is_uuid_trial_ended', [root_url]);
    }, function(is_ended){
        if (is_ended)
            return on_fail&&on_fail(opt);
        return on_succ ? on_succ(opt, started) : true;
    }]);
}

function on_trial_start(root_url){
    be_popup_lib.perr_ok({id: 'be_ui_trial_start',
        info: {root_url: root_url}});
    E.be_ext.set('test_trial', true);
    return E.be_premium.ecall('start_uuid_trial', [root_url]);
}

function get_force_premium_rule(opt){
    opt = opt||{};
    var root_url = opt.root_url || E.get_root();
    return etask([function(){
        return E.be_premium.ecall('is_active');
    }, function(is_premium){
        if (is_premium)
            return false;
        // XXX sergeir: remove when all users will be updated
        if (version_util.cmp(be_util.version(), '1.109.233')<0)
            return false;
        return E.be_premium.ecall('get_force_premium_rule', [root_url]);
    }]);
}

function show_force_premium(opt){
    opt = opt||{};
    var rule, force = true, root_url = opt.root_url || E.get_root();
    var is_premium;
    return etask([function(){
        // XXX sergeir: remove when all users will be updated
        if (version_util.cmp(be_util.version(), '1.109.233')<0)
            return false;
        return E.be_premium.ecall('get_force_premium_rule', [root_url]);
    }, function(r){
        if (!(rule = r))
            return this.goto('no_popup');
        return E.be_premium.ecall('is_active');
    }, function(res){
        if (is_premium = res)
        {
            if (rule.disable_timer)
                return this.goto('no_popup');
            return E.be_premium.ecall('is_uuid_trial_active', [root_url]);
        }
    }, function(is_trial_active){
        if (is_trial_active)
        {
            if (opt.disable)
                hide_trial_timer();
            else
                start_trial_timer(root_url);
            return force = false;
        }
        if (is_premium)
            return this.goto('no_popup');
        if (rule.trial) // XXX arik: rm
            return show_trial_popup(opt);
        var test;
        if (!(test = rule && rule.test) || test.name!='trial')
            return show_premium_popup(opt);
        var on = be_vpn_util.is_conf_allowed(test.on3);
        if (test.on3)
        {
            var first = !E.be_ext.get('test_trial3_on') &&
                !E.be_ext.get('test_trial3_off');
            if (on)
                E.be_ext.set('test_trial3_on', true);
            else if (!on)
                E.be_ext.set('test_trial3_off', true);
            be_popup_lib.perr_ok({id: first ? 'be_trial_select_first' :
                'be_trial_select', info: {on: on, root_url: root_url}});
        }
        if (!on)
            return show_premium_popup(opt);
        return is_trial_available(root_url, opt, function(topt, started){
            force = false;
            return topt.on_trial && !started ? topt.on_trial(root_url) : true;
        }, show_premium_popup);
    }, function(){
        return this.return(force);
    }, function no_popup(){
        var $curr_el;
        if (E.curr_view && E.premium_view)
        {
            $curr_el = E.curr_view.$el;
            $curr_el.removeClass('g-hidden');
            E.premium_view.$el.remove();
            E.premium_view = undefined;
        }
        return false;
    }]);
}

var country_list_view_class = Backbone.View.extend({
    el: '<span>',
    className: 'r_country_list_view',
    events: {
        'click .list_head': 'toggle_list',
    },
    render_opt: {},
    initialize: function(options){
        options = options||{};
        this.no_dropdown = options.no_dropdown;
        this.no_search = options.no_search;
        var $el = this.$el;
        var $list = this.$list = $('<span>', {class: 'dropdown r_country_list'+
            (this.no_dropdown ? '' : ' r_country_list_dropdown')});
        $el.append($list);
        var $head = $('<a>', {class: 'list_head btn '+
            'r_btn-trans r_btn-rm-border '+
            (this.no_dropdown ? 'no-dropdown' : ''),
            'data-toggle': this.no_dropdown || options.on_click ?
                undefined : 'dropdown'}).appendTo($list);
        if (options.on_click)
            $head.click(options.on_click);
        this.country_list_head_view = new country_list_head_view_class({
            fade_head: options.fade_head,
            show_lock: options.show_lock,
            size: options.flag_size,
        });
        if (!this.no_dropdown || options.show_lock)
        {
            var $caret_parent = this.country_list_head_view.$('.flag')
                .parent();
            var $caret = $('<span>', {class: 'caret'});
            $caret.click(function(){ ff_dropdown_resize(); })
            .appendTo($caret_parent);
        }
        $head.append(this.country_list_head_view.$el);
        if (this.no_dropdown)
            return;
        $('body').on('click.country_list_click', this.hide_list.bind(this));
        this.$ul = $('<div>', {class: 'dropdown-menu country-selection'})
        .on('click', function(evt){
            evt.stopPropagation(); });
        if (!this.no_search)
        {
            this.$search = $('<div>', {class: 'country-selection-search'})
            .appendTo(this.$ul);
            $('<li>', {class: 'divider'}).appendTo(this.$ul);
            this.search_term = '';
        }
        this.$li_list = $('<ul>', {role: 'menu'}).appendTo(this.$ul);
    },
    render: function(opt){
        var _this = this;
        opt = opt||{};
        var is_premium = E.be_ext.get('is_premium');
        this.countries = pcountries.proxy_countries.bext.map(function(c){
            return {proxy_country: c, name: T(c), type: !is_premium&&'free'};
        });
        this.countries = _.sortBy(this.countries, 'name');
        this.countries.get = function(c){
            return {proxy_country: c, name: T(c.toUpperCase())}; };
        var active_country = opt.active_country;
        this.country_list_head_view.render({country:
            active_country ? this.countries.get(active_country) : undefined,
            show_plus_logo: opt.show_plus_logo});
        if (this.no_dropdown)
            return;
        this.$list.one('show.bs.dropdown', function(){
            _this.render_list(opt); });
        if (!_.isEqual(opt, this.render_opt))
            _.defer(function(){ this.render_list(opt); }.bind(this));
        this.render_opt = opt;
        if (!opt.no_search)
            this.render_search(opt);
    },
    toggle_list: function(e){
        if (this.no_dropdown || !this.$ul)
            return;
        e.stopPropagation();
        this.$ul.toggleClass('dropdown-menu-open');
        E.set('hide_loader', this.$ul.hasClass('dropdown-menu-open'));
        this.trigger('toggle_list');
    },
    hide_list: function(e){
        E.unset('hide_loader');
        if (!this.$ul)
            return;
        if (e)
            e.stopPropagation();
        this.$ul.removeClass('dropdown-menu-open');
        this.trigger('toggle_list', 'hide');
    },
    remove: function(){
        if (this.$ul)
            this.$ul.remove();
        $('body').off('click.country_list_click');
        Backbone.View.prototype.remove.call(this);
    },
    /**
     * @param {string} [opt.host] Custom host for unblock. Default is current
     * page's host. Example: 'example.com'.
     * @param {boolean} [opt.no_back=false] Remove 'Back to [user_country]'
     * list item.
     * @param {string} [opt.active_country]
     */
    render_list: function(opt){
        var _this = this;
        opt = opt||{};
        var active_country = opt.active_country;
        var src_country = E.get('country');
        var list_html = '';
        if (!_this.search_term)
        {
            if (active_country && !opt.no_back)
            {
                var src = this.countries.get(src_country);
                list_html += get_country_list_item({
                    proxy_country: src.proxy_country,
                    name: T('Back to $1', [src.name]),
                }, true);
            }
            var p = _.pluck(get_popular_country(opt.host), 'proxy_country');
            this.countries.forEach(function(c){
                if (!p.includes(c.proxy_country))
                    return;
                list_html += get_country_list_item(c, false);
            });
            list_html += '<li class="divider"></li>';
        }
        var filtered_countries = this.countries.filter(function(c){
            return !_this.search_term || c.name.toLowerCase()
                .startsWith(_this.search_term.toLowerCase());
        });
        filtered_countries.forEach(function(c){
            list_html += get_country_list_item(c, false);
        });
        this.$li_list.off('click');
        this.$li_list.on('click', '.country', function(){
            var info = $(this).data(), country = info.country.toLowerCase();
            if (!info.disable)
                be_popup_lib.perr_ok({id: 'be_ui_vpn_click_flag'});
            if (info.premium)
            {
                new premium_dialog_view({
                    $parent: $('body'),
                    country: country,
                }).render();
                return _this.hide_list();
            }
            var rule_enabled = !opt.host ? E.get_enabled_rule() : null;
            _this.trigger('select', info.country);
            _this.hide_list();
            if (opt.host)
                set_active_url(opt.host, info.country, info.disable);
            else
                set_country_rule(info.country, info.disable, rule_enabled);
        });
        this.$li_list.html(list_html);
    },
    render_search: function(opt){
        var _this = this;
        var $input = $('<input>', {type: 'text', placeholder:
            T('Search a country')});
        $input.val(this.search_term);
        this.$search.html($input);
        $(this.$search).off('keyup', 'input');
        $(this.$search).on('keyup', 'input',
            _.debounce(function(evt){
                evt.stopPropagation();
                _this.search_term = evt.target.value;
                _this.render_list(opt);
            }, 100));
    },
});

var country_selection_view_class = Backbone.View.extend({
    className: 'r_country_selection_view',
    host: null,
    active_country: null,
    initialize: function(opt){
        var _this = this;
        opt = opt||{};
        this.host = opt.host;
        this.active_country = opt.active_country;
        var $el = this.$el;
        var $row = $('<div>').appendTo($el);
        if (is_tpopup)
        {
            this.list_all = new country_list_view_class({
                fade_head: true,
                show_lock: true,
                no_dropdown: true,
                on_click: function(){
                    _this.trigger('select', _this.p0);
                    _this._set_country_rule(_this.p0, E.get_enabled_rule());
                },
            });
            this.list_all.$el.addClass('country_selection_opt').appendTo($row);
        }
        else
        {
            this.is_multiselect = true;
            $row = $('<div>').appendTo($el);
            this.list_p0 = new country_list_view_class({caret: false,
                no_dropdown: true, className: 'country_selection_opt'});
            this.list_p0.$el.addClass('country_selection_opt '+
                'country_selection_left').appendTo($row)
            .click(function(){
                be_popup_lib.perr_ok({id: 'be_ui_vpn_click_flag'});
                _this.trigger('select', _this.p0);
                _this._set_country_rule(_this.p0, null);
            });
            this.list_p1 = new country_list_view_class({caret: false,
                no_dropdown: true, className: 'country_selection_opt'});
            this.list_p1.$el.addClass('country_selection_opt '+
                'country_selection_center').appendTo($row)
            .click(function(){
                be_popup_lib.perr_ok({id: 'be_ui_vpn_click_flag'});
                _this.trigger('select', _this.p1);
                _this._set_country_rule(_this.p1, null);
            });
            $row.append(this.list_p0.$el).append(this.list_p1.$el);
            this.list_all = new country_list_view_class();
            this.list_all.on('toggle_list', this.toggle_more.bind(this));
            this.list_all.$el.addClass('country_selection_opt '+
                'country_selection_right')
            .appendTo($row);
        }
        if (this.list_all && this.list_all.$ul)
            this.list_all.$ul.appendTo($('body'));
        this.list_all.on('select', function(){
            _this.trigger('select'); });
        return $el;
    },
    _trigger_list_event: function(name, $el){
        var list_num;
        if ($el.hasClass('country_selection_left'))
            list_num = 0;
        else if ($el.hasClass('country_selection_center'))
            list_num = 1;
        else
            list_num = 2;
        this.trigger('list:'+name, list_num);
    },
    _set_country_rule: function(country, rule_enabled){
        if (this.host)
            set_active_url(this.host, country);
        else
            set_country_rule(country, false, rule_enabled);
    },
    toggle_more: function(action){
        if (action == 'hide')
        {
            this.list_all.$el.addClass('country_selection_right');
            this.list_all.$el.removeClass('country_selection_center');
            this.list_p0.$el.show();
            this.list_p1.$el.show();
            return;
        }
        this.list_all.$el.toggleClass('country_selection_right');
        this.list_all.$el.toggleClass('country_selection_center');
        this.list_p0.$el.toggle();
        this.list_p1.$el.toggle();
    },
    render: function(){
        var popular_countries = get_popular_country(this.host);
        var tld = be_vpn_util.get_tld_country(this.host||E.get_host());
        // XXX: alexeym: for new UI country multi-country view
        // order should be "second, main, other"
        var main = this.is_multiselect ? 1 : 0;
        var second = this.is_multiselect ? 0 : 1;
        var ratings = [popular_countries[0], popular_countries[1]];
        if (tld && tld!=ratings[0].proxy_country &&
            tld!=ratings[1].proxy_country)
        {
            ratings.push({proxy_country: tld, rating: 0.1});
            ratings.sort(function(a, b){ return b.rating-a.rating; });
        }
        this['p'+main] = ratings[0].proxy_country;
        this['p'+second] = ratings[1].proxy_country;
        if (is_tpopup)
        {
            this.list_all.render({active_country: this.p0, no_back: true,
                show_plus_logo: E.get('force_premium_rule')});
        }
        else
        {
            this.list_p0.render({active_country: this.p0});
            this.list_p1.render({active_country: this.p1,
                show_plus_logo: E.get('force_premium_rule')});
            this.list_all.render({active_country: this.active_country,
                host: this.host});
        }
        return this;
    },
});

var switch_privacy_view = Backbone.View.extend({
    className: 'switch-privacy',
    events: {
        'click': '_on_click',
    },
    template: zdot.template('<label><input type=checkbox>{[!it.T(\'Total '
        +'privacy - make me anonymous\')]}</label>'),
    initialize: function(opt){
        opt = opt||{};
        this.root_url = opt.root_url || E.get_root();
        this.url = opt.url || E.get_url();
        this.country = opt.country || get_selected_country();
        this.render();
    },
    render: function(){
        if (!E.be_premium)
            return;
        var _this = this;
        etask([function(){
            // XXX sergeir: remove when all users will be updated
            if (version_util.cmp(be_util.version(), '1.114.698')<0)
                return false;
            return E.be_premium.ecall('get_force_privacy_rule',
                [_this.root_url]);
        }, function(rule){
            if (!rule || E.be_ext.get('is_premium'))
                return void _this.$el.html('');
            _this.$el.html(_this.template({T: T}));
        }]);
    },
    _get_url: function(){
        return plus_ref('get_privacy_'+this.root_url.replace(/[^a-z]/g, '_'));
    },
    _on_click: function(e){
        e.preventDefault();
        be_popup_lib.perr_ok({id: 'be_get_privacy', info: {
            domain: this.root_url,
            country: this.country,
            url: this.url,
        }});
        E.ui_popup.open_page(this._get_url());
    },
});

var disable_view_class = Backbone.View.extend({
    className: 'popup-enabled popup-multiselect',
    hover_title: null,
    initialize: function(opt){
        this.options = opt = opt||{};
        var $el = this.$el;
        this.hover_title = opt.title_view || new title_view_class({
            title: T('Select a country'), no_search: true});
        var $title = this.hover_title.$el;
        this.country_selection_view = opt.country_selection_view ||
            new country_selection_view_class();
        if (this.country_selection_view.is_multiselect)
        {
            var $hover_title = this.hover_title.$title;
            $hover_title.append(
                '<i class="popup-multiselect-arrow '+
                'popup-multiselect-arrow-left"></i>'+
                '<i class="popup-multiselect-arrow '+
                'popup-multiselect-arrow-right"></i>');
            var events = {
                'list:mouseenter': function(list_num){
                    $hover_title.addClass('list-hover-'+list_num
                        +' list-hover');
                },
                'list:mouseleave': function(list_num){
                    $hover_title.removeClass('list-hover-'+list_num
                        +' list-hover');
                },
            };
            this.country_selection_view.on(events);
        }
        this.user_message = new user_message_view_class();
        $el.append(this.user_message.$el, $title,
            this.country_selection_view.$el);
    },
    render: function(){
        this.user_message.render();
        this.hover_title.render();
        this.country_selection_view.render();
        $('body').addClass('is-popup-disabled');
        return this;
    }
});
var turned_off_view_class = Backbone.View.extend({
    className: 'popup-disabled',
    template: zdot.template(popup_disabled),
    initialize: function(){
        var class_name = this.className;
        var html = this.template({class_name: class_name});
        this.$el.css({padding: '0'}).html(html);
        this.$head = this.$el.find('.'+class_name+'-icon');
    },
    render: function(){
        this.$head.off('click').one('click', function(){
            setTimeout(function(){
                $('#g_switch').click(); }, animation_time);
        });
        hide_trial_timer();
        $('body').addClass('is-popup-off');
    }
});

function get_selected_country(){
    var status = E.get('status');
    var rule = E.get_enabled_rule() || {};
    var user_country = E.get('user.country');
    if (status=='busy')
        return user_country || rule.country || E.get('redirect_country') || '';
    return rule.country || user_country || E.get('redirect_country') || '';
}

var country_selected_view_class = Backbone.View.extend({
    className: 'country_selected',
    initialize: function(){
        var $el = this.$el, $row;
        if (is_tpopup)
        {
            // XXX shachar: remove _virt_track_activation as it seems to be
            // used only for tracking number of tpopup activations using
            // google-analytics, it's better to just use perr
            // $('<iframe width=0 height=0 style="display:none" src=//hola.org'
            // +'/_virt_track_activation><iframe>').appendTo($el);
            be_popup_lib.perr_ok({id: 'be_tpopup_open'});
        }
        else
        {
            $row = $('<div>').appendTo($el);
            $('<div>', {class: 'icon_arrow'}).appendTo($row);
        }
        $row = $('<div>').appendTo($el);
        this.list_view = new country_list_view_class();
        $row.append(this.list_view.$el);
        if (this.list_view && this.list_view.$ul)
        {
            if (is_tpopup)
                this.list_view.$ul.appendTo($el);
            else
                this.list_view.$ul.appendTo('body');
        }
    },
    render: function(){
        this.prev_country = this.country;
        this.country = get_selected_country();
        if (this.country && this.country == this.prev_country)
            return;
        this.list_view.render({active_country: this.country});
        show_force_premium({country: this.country});
    },
});
var loader_view_class = Backbone.View.extend({
    className: 'popup-loader',
    initialize: function(){
        this.$el.addClass('g-hidden');
        this.$el.html('<div class="popup-loader-spinner popup-loader-back">'+
            '<svg width="100%" height="100%" viewBox="-1 -1 202 202">'+
                '<path class="popup-loader-rail" d="M 180,100 A 80,80 0 0,'+
                    '1 100,180 A 80,80 0 0,1 20,100 A 80,80 0 0,1 100,20 A '+
                    '80,80 0 0,1 180,100" style="fill:none"/>'+
            '</svg>'+
        '</div>'+
        '<div class="popup-loader-spinner popup-loader-bubble-container">'+
            '<svg width="100%" height="100%" viewBox="-1 -1 202 202">'+
                '<path class="popup-loader-bubble" d="M 180,100 A 80,80 0 0,1'+
                    '100,180 A 80,80 0 0,1 20,100 A 80,80 0 0,1 100,20 A 80,'+
                    '80 0 0,1 180,100" style="fill:none"/>'+
            '</svg>'+
        '</div> '+
        '<div class="popup-loader-spinner popup-loader-fore">'+
            '<svg width="100%" height="100%" viewBox="-1 -1 202 202">'+
                '<path class="popup-loader-spincircle" d="M 1,100" '+
                    'style="fill:none"/>'+
            '</svg>'+
        '</div>');
        this.loader_init();
    },
    render: function(parent){
        $(parent).append(this.$el);
    },
    loader_init: function(){
        var _this = this;
        var int_id = 0, int2Id = 0, angle = 0, aperture = 0, d_aperture = 1.5;
        var d_angle = 15, need_finish = false;
        var transform_func = chrome ? '-webkit-transform' : 'transform';
        var arc = this.$('.popup-loader-spincircle')[0];
        var spinner = this.$('.popup-loader-fore')[0];
        var bubble = this.$('.popup-loader-bubble-container')[0];
        function set_aperture(ang){
            ang %= 360;
            var angle_part = 6.28318531*ang/360.0;
            var ex = 100+Math.round(80*Math.cos(angle_part));
            var ey = 100+Math.round(80*Math.sin(angle_part));
            if (ang<=90)
                arc.setAttribute('d', 'M 180,100 A 80,80 0 0,1 '+ex+','+ey);
            else if (ang<=180)
            {
                arc.setAttribute('d', 'M 180,100 A 80,80 0 0,1 100,180 A 80,'+
                    '80 0 0,1 '+ex+','+ey);
            }
            else if (ang<=270)
            {
                arc.setAttribute('d', 'M 180,100 A 80,80 0 0,1 100,180 A 80,'+
                    '80 0 0,1 20,100 A 80,80 0 0,1 '+ex+','+ey);
            }
            else
            {
                arc.setAttribute('d', 'M 180,100 A 80,80 0 0,1 100,180 A 80,'+
                    '80 0 0,1 20,100 A 80,80 0 0,1 100,20 A 80,80 0 0,1 '+ex+
                    ','+ey);
            }
        }
        function burst_bubble(){
            var iterations = 1, bubble_int = 0;
            function start_burst(){
                bubble.setAttribute('class', 'popup-loader-spinner '+
                    'popup-loader-burst');
                setTimeout(function(){
                    bubble.setAttribute('class', 'popup-loader-spinner '+
                        'popup-loader-bubble-container');
                    if (!iterations)
                    {
                        _this.stop_timeout = setTimeout(function(){
                            _this.stop();
                        }, 400);
                    }
                }, 50);
                iterations -= 1;
                if (!iterations && bubble_int)
                    clearInterval(bubble_int);
            }
            start_burst();
            if (iterations)
                bubble_int = setInterval(start_burst, 400);
        }
        function make_frame(){
            if (need_finish && aperture < 350)
                d_aperture = 10;
            else if (need_finish)
            {
                clearInterval(int_id);
                aperture = 359.9;
                burst_bubble();
            }
            else if (aperture > 200)
                d_aperture = (300 - aperture) / 50;
            else
                d_aperture = 1.5;
            set_aperture(aperture);
            aperture = (aperture+d_aperture)%360;
        }
        this.start = function(opt){
            var __this = this;
            this.timeout = clearTimeout(this.timeout);
            if (opt && opt.timeout)
                setTimeout(function(){ __this.stop(); }, opt.timeout);
            need_finish = false;
            if (this.working)
                return;
            this.stop_timeout = clearTimeout(this.stop_timeout);
            this.working = true;
            this.$el.removeClass('g-hidden');
            setTimeout(function(){
                __this.$el.removeClass('g-transparent');
            }, 13);
            $('body').addClass('is-popup-loading');
            if (E.curr_view && E.curr_view.hide_search)
                E.curr_view.hide_search();
            if (int_id)
                clearInterval(int_id);
            int_id = setInterval(make_frame, 50);
            int2Id = setInterval(function(){
                spinner.style[transform_func]='rotate('+angle+'deg)';
                angle=(angle+d_angle)%360;
            }, 50);
        };
        this.stop = function(is_immediately){
            this.$el.addClass('g-transparent');
            clearInterval(int2Id);
            this.timeout = clearTimeout(this.timeout);
            this.stop_timeout = setTimeout(function(){
                set_aperture(0);
                _this.$el.addClass('g-hidden');
                $('body').removeClass('is-popup-loading');
            }, is_immediately ? 10 : animation_time);
            this.working = false;
        };
        this.finish = function(){
            if (need_finish)
                return;
            need_finish = true;
            this.timeout = clearTimeout(this.timeout);
            if (int_id)
                clearInterval(int_id);
            int_id = setInterval(make_frame, 13);
        };
    }
});
var install_exe_view_class = be_backbone.view.extend({
    className: 'install_exe',
    events: {'click .download': 'on_download'},
    template: zdot.template(install_exe),
    message_id: null,
    render: function(){
        this.$el.html(this.template());
        be_popup_lib.perr_err({id: 'be_vpn_install_exe_view'});
        return be_backbone.view.prototype.render.apply(this);
    },
    on_download: function(){
        etask([function(){
            return be_popup_lib.perr_err({id: 'be_vpn_install_exe_click'});
        }, function(){
            E.ui_popup.open_page('http://hola.org/?auto_install=%7B%22type%22%3A%22full%22%2C%22flow%22%3A%22vpn%22%7D');
        }]);
    }
});

var rating_view_class = Backbone.View.extend({
    className: 'popup-rating',
    events: {
        'mouseenter .popup-rating-star': 'on_hover',
        'click .popup-rating-star': 'on_click'
    },
    hints: [
        '',
        'Hate it',
        'Disliked it',
        'It was okay',
        'Like it',
        'Love it',
    ],
    initialize: function(opt){
        opt = opt||{};
        if (opt.hidden)
            this.$el.addClass('popup-rating-hidden');
        var $cont = $('<div>', {class: 'popup-rating-container'});
        var count = 5;
        var i = count;
        while (i--)
        {
            var num = count-i;
            $cont.append($('<span>', {class: 'popup-rating-star '+
                'popup-rating-star-'+num, 'data-num': num}));
        }
        this.$hint = $('<span>', {class: 'popup-rating-hint'})
        .appendTo($cont);
        $('<h3>', {class: 'popup-rating-title popup-more-title'})
        .text(T('Rate us'))
        .appendTo(this.$el);
        $('<div>', {class: 'popup-rating-msg'})
        .text(T('Thank you!'))
        .appendTo(this.$el);
        this.$el.append($cont);
    },
    show: function(){
        this.$el.removeClass('popup-rating-hidden');
        be_popup_lib.perr_ok({id: 'be_vpn_rating_display'});
    },
    get_num: function(target){
        var $star = $(target);
        if (!$star.hasClass('popup-rating-star'))
            return;
        return $star.data('num');
    },
    on_hover: function(e){
        var num = this.get_num(e.target);
        if (!num)
            return;
        this.$el.removeClass(this.active_class);
        this.active_class = 'popup-rating-active-'+num;
        this.$el.addClass(this.active_class);
        this.$hint.text(T(this.hints[num])||'');
    },
    on_click: function(e){
        var num = this.get_num(e.target);
        if (!num)
            return;
        be_popup_lib.perr_ok({id: 'be_vpn_rating_rate'});
        be_popup_lib.perr_ok({id: 'be_vpn_rating_rate_'+num});
        E.be_info.ecall('set_vpn_last_rating', [num]);
        this.$el.addClass('popup-rating-hidden');
        this.trigger('chosen');
    },
});

var rated_view_class = Backbone.View.extend({
    className: 'popup-rated-view',
    events: {
        'click .popup-button-try': 'on_try_premium',
        'click .report-problem': 'on_report_problem',
        'click .rate-us': 'on_rate_us',
    },
    template: zdot.template(rated_template),
    initialize: function(opt){
        this.opt = opt||{};
    },
    show: function(){
        this.opt.hidden = false;
        this.rating = E.be_info&&E.be_info.get('vpn_last_rating') || 0;
        this.is_premium = E.be_ext.get('is_premium');
        this.rate_on_store_ts = E.be_info&&E.be_info.get('rate_on_store');
        // open store for new install & for high mark
        if (this.rating==5 && !this.rate_on_store_ts && version_util.cmp(
            storage.get('install_version'), '1.112.975')>0)
        {
            this.rate_on_store();
        }
        else
            this.render();
    },
    rate_on_store: function(){
        E.be_info.ecall('set_rate_on_store', [Date.now()]);
        var rate_url = 'https://chrome.google.com/webstore/detail'+
            '/hola-better-internet/gkojfkhlekighikafcpjkiklfbnlmeio/reviews';
        if (browser=='opera')
        {
            rate_url = 'https://addons.opera.com/en/extensions/details'+
                '/hola-better-internet/#feedback-container';
        }
        else if (browser=='firefox')
        {
            rate_url = 'https://addons.mozilla.org/ru/firefox/addon/'+
                'hola-unblocker/';
        }
        be_util.open_new_tab({url: rate_url});
    },
    render: function(){
        if (this.opt.hidden)
            return;
        this.$el.html(this.template({
            T: T,
            rating: this.rating,
            is_premium: this.is_premium,
            browser: browser,
        }));
        this.$el.find('.report-problem')
        .attr('href', be_util.problem_mailto_url());
        return this.$el;
    },
    on_try_premium: function(){
        var ref = this.rating==5 ? 'ext_working' : 'ext_not_working';
        be_popup_lib.perr_ok({id: 'be_try_plus_'+ref,
            info: {
                root_url: E.get_root(),
                country: E.get('country'),
            }});
        E.ui_popup.open_page(plus_ref(ref));
    },
    on_report_problem: function(){
        be_popup_lib.perr_err({id: 'be_report_problem',
            rate_limit: {count: 1}});
        E.ui_popup.open_page(be_util.problem_mailto_url());
    },
    on_rate_us: function(){
        be_popup_lib.perr_ok({id: 'be_rate_webstore_click'});
    }
});

var more_opt_view_class = Backbone.View.extend({
    className: 'popup-more',
    is_fix_it_redirect: false,
    no_fix_it_count: {},
    initialize: function(){
        var _this = this;
        var opt = this.opt = {};
        opt.active_classname = 'popup-button-active';
        opt.yes_text = T('Oh, yes!');
        opt.yes_active_text = T('Awesome!');
        opt.no_text = T('No, fix it');
        opt.unsupported_text = T(E.be_ext.get('is_premium') ? 'No, try again' :
            'No, try PLUS');
        var $el = this.$el;
        this.$title = $('<h3>', {class: 'popup-more-title'})
        .text(T('Did it work?')).appendTo($el);
        this.$buttons = $('<div>', {class: 'popup-more-row'}).appendTo($el);
        this.$btn_yes = $('<button>', {class:
            'popup-button popup-button-yes'})
        .text(opt.yes_text).appendTo(this.$buttons)
        .click(function(e){
            e.stopPropagation();
            _this.on_yes();
        });
        this.$btn_no = $('<button>', {class: 'popup-button popup-button-no'})
        .text(opt.no_text).appendTo(this.$buttons)
        .click(this.on_no.bind(this));
        this.$rating_wrapper = $('<div>', {class: 'vpn-rated-container'})
        .appendTo($el);
        this.rated_view = _this.rated_view||new rated_view_class({
            hidden: true});
        this.rated_view.$el.appendTo(this.$rating_wrapper);
        if (browser=='chrome')
        {
            this.rating_view = this.rating_view||new rating_view_class({
                hidden: true});
            this.rating_view.$el.appendTo(this.$rating_wrapper);
            this.rating_view.on('chosen', function(){
                _this.rated_view.show();
            });
        }
        $('#servers_list').remove();
        this.$more = $('<div>', {id: 'servers_list', class:
            'popup-more-servers g-hidden'})
        .insertAfter('#popup');
    },
    on_no: function(){
        this.$el.children().hide();
        status_set('Changing IP...');
        var tab_id = get_tab_id();
        this.no_fix_it_count[tab_id] = (this.no_fix_it_count[tab_id]||0)+1;
        var rule_enabled = E.get_enabled_rule();
        var country = rule_enabled ? rule_enabled.country.toLowerCase() :
            undefined;
        var src_country = E.get('country').toLowerCase();
        var uid = E.ui_popup.nav.model.options.be_premium.attributes.user
            && E.ui_popup.nav.model.options.be_premium.attributes.user
            .hola_uid;
        var log, be_bg_main = window.popup_main&&window.popup_main.be_bg_main;
        var config = E.be_ext.get('bext_config'), debug_domains;
        var root_url = E.get_root(), scr_et;
        if (this.no_fix_it_count[tab_id]==1 && be_bg_main &&
            (debug_domains = zutil.get(config, 'debug_logs.domains')) &&
            debug_domains.includes(root_url))
        {
            log = be_bg_main.fcall('get_log', [zerr.log]);
            var scr_opt;
            if (scr_opt = zutil.get(config, 'debug_logs.screenshot'))
            {
                scr_et = etask([function(){
                    B.tabs.capture_visible_tab(scr_opt, this.return_fn());
                    return this.wait(1*SEC);
                }, function catch$(){
                }]);
            }
        }
        var is_premium = E.be_ext.get('is_premium');
        etask([function(){
            return scr_et;
        }, function(screenshot){
            return be_popup_lib.perr_err({id: 'be_ui_vpn_click_no_fix_it',
                info: assign({src_country: src_country, hola_uid: uid,
                url: E.get_url(), root_url: root_url, premium: is_premium,
                proxy_country: country, log: log, tab_id: tab_id,
                screenshot: screenshot},
                _.pick(rule_enabled||{}, 'name', 'type', 'md5'))});
        }, function(res){
            if (be_bg_main && res && res.bug_id)
                be_bg_main.fcall('set_bug_id', [res.bug_id]);
        }]);
        this.update_yes(false);
        if (this.$support_link)
            this.$support_link.show();
        if (this.is_fix_it_redirect && !is_premium)
            return void unsupported_open('not-working', E.get_root(), country);
        var _this = this;
        var cb = function(){
            return etask({cancel: true}, [function(){
                status_set('Testing...');
                return etask.sleep(3000);
            }, function(){
                _this.$el.children().show();
                status_clr();
            }]);
        };
        E.sp.spawn(fix_vpn(cb));
    },
    on_yes: function(){
        var _this = this;
        var rule_enabled = E.get_enabled_rule();
        if (!rule_enabled || this.poll_voted)
            return;
        var c = rule_enabled.country.toLowerCase();
        var root_url = E.get_root(), url = E.get_url();
        var uid = E.ui_popup.nav.model.options.be_premium.attributes.user &&
            E.ui_popup.nav.model.options.be_premium.attributes.user.hola_uid;
        set_working();
        this.update_yes(true);
        be_popup_lib.perr_err({id: 'be_vpn_ok', info: assign({
            src_country: E.get('country').toLowerCase(), url: url,
            root_url: root_url, proxy_country: c, hola_uid: uid},
            _.pick(rule_enabled, 'name', 'type', 'md5'))});
        this.poll_voted = true;
        var rating = E.be_info && E.be_info.get('vpn_last_rating') || 0;
        var vpn_work_yes = E.be_info && E.be_info.get('vpn_work_yes') || 0;
        vpn_work_yes++;
        if (E.be_info)
            E.be_info.ecall('increment_vpn_work_yes', []);
        this.$title.addClass('g-hidden');
        this.$buttons.hide(animation_time, function(){
            if (_this.rating_view && ((rating||0)<5 && vpn_work_yes%4==1))
                _this.rating_view.show();
            else
                _this.rated_view.show();
        });
    },
    update_yes: function(active){
        var $yes = this.$btn_yes;
        var $no = this.$btn_no;
        $yes.toggleClass(this.opt.active_classname, active)
        .text(active ? this.opt.yes_active_text : this.opt.yes_text);
        if (!active)
            return;
        $no.addClass('g-transparent');
        this.$title.addClass('g-transparent');
        setTimeout(function(){
            $no.addClass('g-hidden');
            $yes.addClass('popup-button-response');
        }, animation_time);
    },
    remove: function(){
        this.hide();
        this.hide_more();
        $('#servers_list').remove();
        Backbone.View.prototype.remove.call(this);
    },
    render: function(){
        var _this = this;
        var $no = this.$btn_no;
        this.is_fix_it_redirect = this._is_fix_it_redirect();
        $no.text(this.is_fix_it_redirect ? this.opt.unsupported_text
            : this.opt.no_text);
        if (!this.poll_voted)
            this.show();
        E.sp.spawn(etask({cancel: true}, [function(){
            return be_util.get_www_config();
        }, function(data){
            if (!data || !data.popup_need_help ||
                !data.popup_need_help.enabled)
            {
                return;
            }
            var countries = data.popup_need_help.countries;
            if (countries && countries.length &&
                !countries.includes(E.get('country')))
            {
                return;
            }
            if (_this.$support_link)
                _this.$support_link.remove();
            _this.$support_link = $('<a>', {target: '_blank'})
            .attr('href', 'https://hola.org/support')
            .text(' '+T('Need Help?'))
            .click(function(e){
                be_popup_lib.perr_ok({id: 'be_ui_vpn_number_of_need_help'});
            }).hide()
            .appendTo(_this.$buttons);
        }]));
    },
    show_more: function(){
        $('body').addClass('is-popup-servers');
        this.$more.removeClass('g-hidden');
    },
    hide_more: function(){
        $('body').removeClass('is-popup-servers');
        this.$more.addClass('g-hidden');
    },
    show: function(){
        this.$el.removeClass('g-hidden');
        $('body').addClass('is-popup-mini');
    },
    hide: function(){
        this.$el.addClass('g-hidden');
        this.hide_more();
        $('body').removeClass('is-popup-mini');
    },
    _is_fix_it_redirect: function(){
        // XXX colin: derry wants the following to be added
        // for platforms where hola_svc not relevant (non-Windows) - you can in
        // 2nd ‘not working’. In platforms where hola_svc exists but not
        // installed - in ‘not working’ (first one!) - you can recommend
        // ‘hola_svc’, and in 2nd ‘not working’ you can recommend alternative
        // VPNs.
        if (!E.be_ext.get('enable_unsupported'))
            return false;
        return this.no_fix_it_count[get_tab_id()]>=1;
    },
});
var title_view_class = Backbone.View.extend({
    className: 'popup-hover-title',
    initialize: function(opt){
        this.opt = opt||{};
        var _this = this;
        if (this.opt.no_search)
            this.$el.addClass('no-search');
        var title_text = this.opt.title||T('Browsing from');
        this.$title = $('<div>', {class: 'popup-enabled-title'});
        this.$title.append($('<h2>', {class: 'popup-title'})
            .text(title_text));
        this.$el.append(this.$title);
        if (this.opt.no_search)
            return;
        this.$search_container = $('<div>', {class:
            'popup-search-container'});
        this.$search = $('<div>', {class: 'popup-search'})
        .appendTo(this.$search_container);
        this.search = init_search(this.$search);
        this.search.$('.twitter-typeahead').append($('<span>', {class:
            'popup-search-trigger'}).click(function(){
                _this.search.select();
            }));
        this.$search.addClass('popup-search-advanced g-hidden');
        this.search.$el.addClass('g-transparent');
        this.$search.prepend($('<div>', {class: 'popup-search-title'})
            .html(T('Browsing')+'<span>&nbsp;'+T('From')+'</span>'));
        this.$search.append($('<div>', {class: 'popup-search-title-bottom'})
            .html('<span>'+T('Browsing')+'&nbsp;</span>'+T('From')));
        var events = {mouseenter: function(){ _this.show_search(); },
            mouseleave: function(){ _this.hide_search(); }};
        this.$title.on(events);
        this.$search.on(events);
        this.$el.prepend(this.$search_container);
    },
    render: function(){
        if (this.opt.no_search)
            return;
        if (this.search.$input.typeahead)
            this.search.$input.typeahead('val', E.get_root());
        else
            this.search.$input.val(E.get_root());
    },
    show_search: function(){
        var _this = this;
        var $body = $('body');
        if ($body.hasClass('is-popup-loading'))
            return;
        this.search_hide_timer = clearTimeout(this.search_hide_timer);
        this.$title.addClass('g-hidden');
        this.$search.removeClass('g-hidden');
        this.search.$el.removeClass('g-transparent');
        this.search_show = setTimeout(function(){
            _this.$search.addClass('popup-search-hover');
        }, 13);
    },
    hide_search: function(){
        if (this.search_hide_timer)
            return;
        var _this = this;
        this.search.off('blur');
        if (this.$search.find('.js-search-active').length > 0 && this.search)
            this.search.on('blur', function(){ _this.hide_search(); });
        else
        {
            this.search_show = clearTimeout(this.search_show);
            this.search.$el.addClass('g-transparent');
            this.$search.removeClass('popup-search-hover');
            this.search_hide_timer = setTimeout(function(){
                _this.$title.removeClass('g-hidden');
                _this.$search.addClass('g-hidden');
            }, animation_time);
        }
    }
});
var user_message_view_class = Backbone.View.extend({
    className: 'user-message',
    initialize: function(){
        this.$el.hide();
        this.msg = this.get_message();
        if (this.msg)
        {
            var conf_msg = this.config(this.msg.id);
            conf_msg.show_n = (conf_msg.show_n||0)+1;
            this.config(this.msg.id, conf_msg);
            be_popup_lib.perr_ok({id: 'be_user_message_show', info:
                {id: this.msg.id}});
        }
    },
    _match_type_fn: function(type, every, cb){
        return function(match){
            match = match.filter(function(m){
                return m.type == type; });
            if (!match.length)
                return true;
            return match[every ? 'every' : 'some'](cb);
        };
    },
    get_message: function(){
        var _this = this;
        var conf = E.be_ext.get('bext_config');
        var messages = conf && conf.user_message || [];
        var country = get_selected_country(), site = E.get_root();
        var ext_data = {is_tpopup: !!is_tpopup};
        var svc_info = E.be_svc&&E.be_svc.get('info')||{};
        var svc_data = zutil.get(svc_info, 'raw.data')||[];
        var match_fns = [function(match, msg){
            var conf_msg = _this.config(msg.id);
            if (conf_msg.hide)
                return false;
            if (!msg.max_show)
                return true;
            return !(conf_msg.show_n>=msg.max_show);
        }, this._match_type_fn('version', false, function(m){
            return be_util.version() == m.value;
        }), this._match_type_fn('ext_data', true, function(m){
            return ext_data[m.name] == m.value;
        }), this._match_type_fn('svc_data', true, function(m){
            return svc_data.includes(m.value);
        }), this._match_type_fn('country', false, function(m){
            return m.value=='*' || m.value==country;
        }), this._match_type_fn('site', false, function(m){
            var host = m.value=='*' ? '**' : m.value;
            var re = new RegExp('^'+zurl.http_glob_host(host)+'$');
            return re.test(site);
        })];
        return messages.find(function(msg){
            var match = (msg.match||[]).map(function(m){
                if (typeof m=='string')
                {
                    var arr = m.split(':');
                    return {type: arr[0], value: arr[1]};
                }
                return m;
            });
            var res = match_fns.every(function(fn){
                return fn(match, msg); });
            if (res && !res.show)
            {
                be_popup_lib.perr_ok({id: 'be_user_message_hidden',
                    info: {id: res.id}});
                return false;
            }
            return res;
        });
    },
    config: function(id, c){
        var key = 'user_messages';
        var conf_obj = storage.get_json(key)||{};
        var conf_msg = Object.assign(conf_obj[id]||{}, c);
        if (!c)
            return conf_msg;
        var patch = {};
        patch[id] = conf_msg;
        storage.set_json(key, Object.assign(conf_obj, patch));
        return conf_msg;
    },
    render: function(){
        var _this = this;
        this.$el.empty();
        this.$el.attr('class', '');
        var msg = this.msg;
        if (!msg)
        {
            this.$el.hide();
            return;
        }
        var style = (msg.style||'info').split(/\s+/);
        this.$el.addClass('user-message');
        this.$el.addClass(style.map(function(s){
            return 'user-message-'+s; }).join(' '));
        if (style.includes('closable'))
        {
            var $close = $('<a class=close></a>');
            this.$el.append($close);
            $close.on('click', function(){
                _this.config(msg.id, {hide: true});
                _this.$el.hide();
                be_popup_lib.perr_ok({id: 'be_user_message_close', info:
                    {id: msg.id}});
            });
        }
        this.$el.append($('<div class=message></div>').html(msg.message));
        if (msg.link)
        {
            this.$el.append('<div class=more><a href="'+msg.link.url
                +'" target="_blank" rel="noopener noreferrer">'
                +msg.link.label+'</a></div>');
        }
        this.$el.find('.message a, .more a').on('click', function(){
            be_popup_lib.perr_ok({id: 'be_user_message_click', info:
                {id: msg.id}});
            if (this.href.startsWith('mailto:'))
                E.ui_popup.open_page(this.href);
            else if (!this.target)
                be_util.open_tab({url: this.href, force_new: true});
        });
        this.$el.show();
    }
});

function new_status(){
    var $ret = $('<div>', {style: 'position: relative; '+
        'left: 55px; top: -157px;'});
    var spin = new be_ui_obj.spin_view();
    $ret.append(spin.$el);
    return $ret;
}

var enable_view_class = Backbone.View.extend({
    className: 'popup-enabled',
    initialize: function(){
        this.class_name = 'enable_view_class';
        var $container = $('<div>', {class: 'popup-enabled-content'});
        var hover_title = this.hover_title = new title_view_class({
            no_search: true});
        this.$search = hover_title.$search;
        this.search = hover_title.search;
        this.country_selected_view = new country_selected_view_class();
        this.more_opt = new more_opt_view_class();
        this.switch_privacy = new switch_privacy_view({});
        this.$status = new_status();
        this.user_message = new user_message_view_class();
        $container.append(this.user_message.$el, hover_title.$el,
            this.country_selected_view.$el);
        this.$el.append($container, this.switch_privacy.$el,
            this.more_opt.$el, this.$status);
        this.state_cb_ref = this.state_cb.bind(this);
        E.on_init('change:state', this.state_cb_ref);
    },
    state_cb: function(){
        var state = E.get('state');
        if (state=='enable')
        {
            this.$status.hide();
            this.more_opt.$el.show();
            status_clr();
        }
        else
        {
            this.more_opt.$el.hide();
            this.$status.show();
            status_set('Testing...');
        }
    },
    render: function(){
        var country = get_selected_country();
        if (this.prev_country && this.prev_country==country)
            return;
        this.user_message.render();
        this.hover_title.render();
        this.country_selected_view.render();
        $('body').addClass('is-popup-enable-view');
        this.more_opt.render();
        if (this.country_selected_view.country!=this.prev_country)
            this.more_opt.hide_more();
        show_force_premium({on_trial: on_trial_start});
        this.prev_country = country;
    },
    remove: function(){
        status_clr();
        E.off('change:state', this.state_cb_ref);
        $('body').removeClass('is-popup-enable-view');
        if (this.more_opt)
        {
            this.more_opt.remove();
            this.more_opt = null;
        }
        Backbone.View.prototype.remove.call(this);
    }
});
var popular_view_class = Backbone.View.extend({
    className: 'r_popular_view',
    initialize: function(){
        var _this = this;
        this.$search = $('<div>', {class: 'r_ui_search'});
        this.search = init_search(this.$search);
        this.search.$('.twitter-typeahead').append($('<span>', {class:
            'popup-search-trigger'}).click(function(){
                _this.search.select();
            }));
        this.user_message = new user_message_view_class();
    },
    render: function(){
        var _this = this;
        var country = E.get('country');
        var $popular = $('<div>', {class: 'popup-popular'});
        this.$title = $('<h2>', {class: 'popup-title'})
        .html(T('Most popular in')+' <span class="country">'+T(country)
        +'</span>');
        var $search_container = $('<div>', {class:
            'popup-search-container'});
        this.$search.addClass('popup-search g-transparent')
        .removeClass('r_ui_search').appendTo($search_container);
        $popular.append($search_container);
        $popular.append(this.$title);
        var events = {mouseenter: function(){ _this.show_search(); },
            mouseleave: function(){ _this.hide_search(); }};
        var list = E.get('unblocking_rate')||[];
        this.$popular_list = $('<div>', {class: 'popup-popular-list'})
        .appendTo($popular);
        list.forEach(function(p){
            _this.$popular_list.append($new_popular_block(p));
        });
        var popular_footer_item = '<div class=\'popular-footer-item\'></div>';
        var $popular_footer = $('<div></div>', {class: 'popular-footer'})
        .html(popular_footer_item+popular_footer_item+popular_footer_item);
        $popular.append($popular_footer);
        var $more_sites = $('<a>', {class: 'popular-more', target: '_blank',
            href: 'https://hola.org/access/popular'});
        $popular.append($more_sites);
        this.$title.on(events);
        this.$search.on(events);
        this.$el.empty();
        this.user_message.render();
        this.$el.append(this.user_message.$el, $popular);
        $('body').addClass('is_popular_view');
    },
    show_search: function(){
        this.$title.addClass('g-transparent');
        this.$popular_list.addClass('popup-popular-list-blur');
        this.$search.removeClass('g-transparent');
    },
    hide_search: function(){
        var _this = this;
        this.search.off('blur');
        if (this.$search.find('.js-search-active').length > 0 && this.search)
            this.search.on('blur', function(){ _this.hide_search(); });
        else
        {
            this.$title.removeClass('g-transparent');
            this.$popular_list.removeClass('popup-popular-list-blur');
            this.$search.addClass('g-transparent');
        }
    }
});

var redirect_view_class = Backbone.View.extend({
    className: 'popup-redirect hidden-until-reload',
    links: null,
    current_root: null,
    rule_enabled: null,
    disable_view: null,
    selected_host: null,
    events: {
        'change .sites-list .link input': '_on_site_change'
    },
    initialize: function(opt){
        this.current_root = svc_util.get_root_url(E.be_tabs.get('active.url'));
        this.links = opt.links;
        this.links.push(this.current_root);
        this.selected_host = this.links[0];
        this.rule_enabled = E.get_enabled_rule();
    },
    render: function(){
        var _this = this;
        // XXX arik: quick hack for redirect view. flags overlap footer
        // need to rewrite flags layout
        $('#footer').hide();
        if (this.disable_view)
            this.disable_view.remove();
        this.$el.empty();
        // XXX alexeym: remove display: none after extension update
        // (when most of users will use version with new popup.css)
        var $el = this.$el.css('display', 'none');
        $('body').addClass('is-redirect-suggest');
        $el.append($('<h2>', {class: 'popup-title title'})
            .text(T('Select site to access')));
        var $list = $('<ul>', {class: 'sites-list'});
        $el.append($list);
        _.forEach(this.links, function(link){
            _this.create_item(link, 'unblock', link==_this.selected_host)
            .data('link', link).appendTo($list);
        });
        var title_view = new title_view_class({title: T('Select a country'),
            no_search: true});
        etask([function(){
            return show_force_premium({root_url: _this.selected_host});
        }, function(has_popup){
            if (has_popup)
                return;
            var country_selection_view = new country_selection_view_class({
                active_country: !!_this.rule_enabled&&E.get('country'),
                host: _this.selected_host
            });
            country_selection_view.on('select', _this._on_country_select,
                _this);
            _this.disable_view = new disable_view_class({
                title_view: title_view,
                country_selection_view: country_selection_view,
                host: _this.selected_host,
            });
            $el.append(_this.disable_view.render().$el);
        }]);
    },
    _on_country_select: function(country){
        var _this = this;
        etask([function(){
            return show_force_premium({root_url: _this.selected_host,
                country: country});
        }, function(res){
            if (res)
                return;
            E.redirect_view_closed = true;
            var info = {current_root: _this.current_root, links: _this.links,
                country: country};
            if (E.get('country')==country)
            {
                be_popup_lib.perr_ok({id: 'be_ui_vpn_redirect_reject', info:
                    info});
            }
            else
            {
                info.unblock = _this.selected_host;
                be_popup_lib.perr_ok({id: 'be_ui_vpn_redirect_unblock',
                    info: info});
            }
        }]);
    },
    _on_site_change: function(e){
        this.selected_host = $(e.target).closest('.link').data('link');
        this.render();
    },
    create_item: function(text, class_name, checked){
        var $text = $('<span>', {class: 'text'}).text(text);
        var $radio = $('<input>', {type: 'radio', name: 'country',
            checked: !!checked});
        var $label = $('<label>').append($radio).append($text);
        return $('<li>', {class: 'link f32 '+class_name}).append($label);
    }
});

var ext_promo_view_class = be_backbone.view.extend({
    className: 'more-from-hola',
    events: {
        'click .more-from-hola-items a': 'on_promo_click',
        'click .more-from-hola-desc': 'on_more_click',
        'animationend .appear-anim-plus': 'on_animation_end',
    },
    template: zdot.template(ext_promo),
    initialize: function(){
        var _this = this;
        if (E.get('icon_plus_anim')===undefined)
            E.set('icon_plus_anim', true);
        return etask([function(){
            return E.be_premium ? E.be_premium.ecall('is_active') : null;
        }, function(is_premium){
            _this.is_premium = is_premium;
        }]);
    },
    id_prefix: 'be_ui_vpn_click_ext_promo',
    link_type: function(a){
        var $a = $(a);
        if ($a.hasClass('more-va'))
            return 'va';
        if ($a.hasClass('more-ab'))
            return 'ab';
        if ($a.hasClass('more-android'))
            return 'android';
        if ($a.hasClass('more-ios'))
            return 'ios';
        if ($a.hasClass('more-premium'))
            return 'premium';
    },
    on_promo_click: function(e){
        var type = this.link_type(e.currentTarget);
        var id = this.id_prefix+'_'+type;
        be_popup_lib.perr_ok({id: id});
        return true;
    },
    on_more_click: function(e){
        var id = this.id_prefix+'_more_link';
        be_popup_lib.perr_ok({id: id});
        return true;
    },
    on_animation_end: function(e){
        this.$el.find('.appear-anim-plus').removeClass('appear-anim-plus');
        E.set('icon_plus_anim', false);
    },
    render: function(){
        // XXX sergeir: different css when is_premium and not
        this.$el.html(this.template({is_premium: this.is_premium,
            icon_plus_anim: E.get('icon_plus_anim')}));
        return be_backbone.view.prototype.render.apply(this);
    }
});

function fix_vpn_perr(opt){
    if (!opt)
        return;
    var url = opt.url;
    var rule_enabled = opt.rule;
    if (!rule_enabled)
        return;
    var root_url = opt.root_url;
    var p = E.be_rule.get('verify_proxy_ret')||{};
    var c = rule_enabled.country.toLowerCase();
    var info = assign({
        src_country: E.get('country').toLowerCase(),
        url: url,
        root_url: root_url,
        proxy_country: c,
        tunnel: p.tunnel&&p.tunnel.tunnel,
        proxy_error: p.error,
        agent: (p.basic||p.verify_proxy||{}).agent,
        zagent_log: E.be_vpn.get('zagent_conn_log')||[],
        callback_raw: E.be_mode.get('svc.callback_raw'),
        callback_ts: E.be_mode.get('svc.callback_ts'),
        mode_change_count: E.be_mode.get('mode_change_count'),
        multiple_mode_changes: E.be_mode.get('mode_change_count')>2,
        real_url: E.be_tabs.get('active.url'),
        status: E.be_tabs.get('active.status'),
    }, _.pick(rule_enabled, 'name', 'type', 'md5'));
    return etask([function(){
        return E.be_tabs.ecall('get_trace', [get_tab_id()]);
    }, function(trace){
        info.page_load = trace && trace.length &&
            trace[trace.length-1].duration;
        return info;
    }, function finally$(){
        be_popup_lib.perr_err({id: 'be_ui_vpn_script_not_work', info: info});
    }]);
}
var fix_tasks = {};
// XXX arik: need to mv logic to background. otherwise if user close popup we
// will not fix connection...
function fix_vpn_old(cb){
    var rule_enabled = E.get_enabled_rule();
    var root_url = E.get_root(), url = E.get_url();
    if (!rule_enabled||!root_url)
    {
        be_popup_lib.perr_err({id: 'be_ui_vpn_no_rule',
            info: {country: E.get('country'), root_url: root_url, url: url}});
        return;
    }
    var info;
    var timeout = Date.now();
    var tab_id = get_tab_id();
    if (fix_tasks[tab_id])
        fix_tasks[tab_id].return();
    return fix_tasks[tab_id] = etask({cancel: true}, [function(){
        return fix_vpn_perr({rule: rule_enabled, root_url: root_url,
            url: url});
    }, function(perr_info){
        info = perr_info;
        return E.change_proxy(rule_enabled, 'not_working', true);
    }, function(){
        var proxy_timeout = Date.now()-timeout;
        if (proxy_timeout<10*SEC)
            return true;
        return this.return();
    }, function get_trace(){
        return E.be_tabs.ecall('get_trace', [tab_id]);
    }, function(trace){
        var last_trace = trace && trace.length && trace[trace.length-1];
        var status = last_trace && last_trace.status;
        // XXX alexeym : if you assume status is array, should check !status
        if (!status)
        {
            this.fix_waiting = true;
            return this.wait(20*SEC);
        }
        info.page_load = last_trace && last_trace.duration;
        if (info.page_load<20*SEC && !['4', '5'].includes(status[0]))
            return this.return(true);
        return this.return();
    }, function(){
        this.fix_waiting = false;
        return this.goto('get_trace');
    }, function finally$(err){
        if (cb)
            return cb();
    }, function catch$(err){
        this.fix_waiting = false;
        be_popup_lib.perr_err({id: 'be_ui_vpn_script_fix_rule', info: info,
            err: err});
    }]);
}

function fix_vpn(cb){
    if (!E.be_ext.get('gen.fix_vpn_bg_on') ||
        version_util.cmp(be_util.version(), '1.120.511')<0)
    {
        return fix_vpn_old(cb);
    }
    var rule = E.get_enabled_rule(), root_url = E.get_root();
    if (!rule || !root_url)
    {
        return void be_popup_lib.perr_err({id: 'be_ui_vpn_no_rule',
            info: {country: E.get('country'), root_url: root_url,
            url: E.get_url()}});
    }
    return etask('fix_vpn', [function(){
        set_ui_status('busy', {desc: 'Finding new peers...'});
        return E.be_rule.ecall('fix_vpn', [{rule: rule, root_url: root_url,
            tab_id: get_tab_id(), url: E.get_url(),
            src_country: (E.get('country')||'').toLowerCase()}]);
    }, function finally$(){
        set_ui_status();
        if (cb)
            return cb();
    }, function catch$(err){
        be_popup_lib.perr_err({id: 'be_ui_fix_vpn_err', err: err});
    }]);
}

E.on_show = function(){
    E.is_visible = true;
    update_footer();
    on_ext_display();
};

E.on_hide = function(){
    E.is_visible = false;
};

function on_ext_display(){
    if (E.is_visible && !E.displayed && !is_tpopup && E.curr_view)
    {
        E.displayed = true;
        be_popup_lib.perr_ok({id: 'be_ui_display_ext_vpn'});
    }
}

function must_install_exe(){
    // only new users (first install version is >1.11.965) should install exe
    // XXX bahaa FF_WEBEXT: disabled because webext doesn't detect svc
    return (browser=='firefox' && !E.conf.firefox_web_ext2 && version_util.cmp(
        storage.get('install_version'), '1.11.965')>0 || browser == 'torch')
        && (be_util.os_win() || be_util.os_mac()
        && version_util.cmp(be_util.os_guess.version, '10.9')>=0)
        && !E.be_mode.get('svc.detected');
}

function get_redirect_list(){
    if (!chrome || is_tpopup || !E.be_tabs || !E.be_tabs.get_redirect_list
        || !E.be_premium)
    {
        return;
    }
    var list = E.be_tabs.get_redirect_list(get_tab_id())||[];
    if (!list.length)
        return [];
    // XXX sergeir: quick fix for hola.org
    list = list.filter(function(u){ return u!='hola.org'; });
    var premium_redirect = false;
    return etask([function(){
        var list_w_current = list.concat(
            svc_util.get_root_url(E.be_tabs.get('active.url')));
        return etask.for_each(list_w_current, [function(){
            return E.be_premium.ecall('get_force_premium_rule',
                [this.iter.val]);
        }, function(rule){
            if (rule)
                premium_redirect = true;
        }]);
    }, function(){
        if (premium_redirect)
            return [];
        return list;
    }]);
}

function curr_view_remove(){
    if (!E.curr_view || !E.curr_view.remove)
        return;
    E.curr_view.remove();
    E.curr_view = null;
}

E.render = _.debounce(function(){
    var be_bg_main = window.be_popup_main.be_bg_main;
    var $up, state, enabled = be_bg_main.get('enabled');
    var redirect_page = E.redirect_page();
    var navigating_to = E.get('navigating_to');
    if (!is_tpopup)
        be_bg_main.set('local_tpopup.ts', Date.now());
    return etask([function(){
        state = E.get('state');
        // XXX arik/mark hack: need a nicer way to handle removal from DOM
        if (state=='error')
            return E.set_err('be_ui_vpn_render_state_err');
        state = !enabled ? 'turned_off' : state;
        if (E.curr_view && E.curr_view.state==state && !redirect_page
            && !navigating_to)
        {
            return this.goto('render');
        }
        E.unset('hide_loader');
        $('body').removeClass('is_popular_view is-popup-off '+
            'is-popup-disabled is-popup-error is-redirect-suggest');
        if (!enabled)
        {
            curr_view_remove();
            E.curr_view = new turned_off_view_class();
        }
        else if (must_install_exe())
        {
            curr_view_remove();
            E.curr_view = new install_exe_view_class();
        }
        else if (redirect_page || navigating_to)
        {
            var country = redirect_page ? redirect_page.country
                : navigating_to.country;
            state = 'enable';
            E.set('redirect_country', country);
            if (E.loader) // XXX arik: rm loader code
                E.loader.start();
            if (zutil.get(E.curr_view, 'class_name')!='enable_view_class')
            {
                curr_view_remove();
                E.curr_view = new enable_view_class();
            }
        }
        else if (state=='skip_url')
        {
            curr_view_remove();
            E.curr_view = new popular_view_class();
        }
        else if (state=='premium_popup')
        {
            var hide_view = function(){
                E.unset('hide_loader');
                E.ui_popup.close_popup();
            };
            curr_view_remove();
            be_popup_lib.perr_ok({id: 'be_show_require_plus',
                info: {root_url: E.get('premium_popup.root_url'),
                trial_ended: E.get('premium_popup.trial_ended')}});
            E.curr_view = new site_premium_ui({
                be_ext: E.be_ext,
                be_tabs: E.be_tabs,
                be_premium: E.be_premium,
                trial_ended: E.get('premium_popup.trial_ended'),
                root_url: E.get('premium_popup.root_url') || E.get_root(),
                on_try: hide_view,
                unsupported: is_blacklist(E.get_root(), E.get_host()),
            });
        }
        else
        {
            curr_view_remove();
            return get_redirect_list();
        }
        return this.goto('update_state');
    }, function(redirect_list){
        if (!redirect_list || !redirect_list.length || E.redirect_view_closed)
            return;
        if (E.loader)
        {
            E.loader.finish();
            E.loader.stop();
        }
        curr_view_remove();
        E.curr_view = new redirect_view_class({links: redirect_list});
    }, function update_state(){
        if (!E.curr_view)
        {
            if (state=='enable')
                E.curr_view = new enable_view_class();
            else
                E.curr_view = new disable_view_class();
        }
        E.curr_view.state = state;
        if (!E.curr_view.was_appeneded)
        {
            $up = $('<div>', {class: 'r_ui_up'}).append(E.curr_view.$el);
            E.$el.empty().append($up);
            E.curr_view.was_appeneded = true;
        }
    }, function render(){
        E.curr_view.render();
        update_footer();
        on_ext_display();
    }, function(){ E.trigger('render_done');
    }, function catch$(err){ E.set_err('be_ui_vpn_render_err', err); }]);
});

function set_user_cmd(opt){
    zerr.notice('tab:%d user action %s cmd %s country %s', get_tab_id(),
        opt.label, opt.cmd, opt.country);
    var new_state;
    if (E.get_enabled_rule())
        new_state = {};
    else
        new_state = {state: 'disable'};
    if (!new_state.state && opt.state)
        new_state.state = opt.state;
    // XXX arik NOW: need better way to set status
    E.set(assign({'user.country': opt.country, 'user.cmd': opt.cmd,
        'user.opt': opt}, opt.no_busy ? new_state :
        {status: 'busy', status_opt: {desc: 'Connecting...'}}));
}

E.script_set = function(rule, val){
    var ts = Date.now();
    return etask([function(){
        clr_working();
        return E.be_ext.ecall('set_enabled', [true]);
    }, function(){
        if (!E.be_ext.get('r.ext.enabled'))
            be_popup_lib.perr_err({id: 'be_ui_vpn_set_enabled_mismatch'});
        if (!E.be_ext.get('r.vpn.on'))
            return E.be_vpn.ecall('enable', []);
    }, function(){
        var new_rule = {name: rule.name, enabled: +val.enabled,
            country: val.country||rule.country, type: rule.type,
            root_url: val.root_url};
        if (val.expire)
            new_rule.expire = val.expire;
        new_rule.premium = !!val.premium;
        if (!new_rule.enabled)
            E.set('navigating_to', false);
        return E.be_rule.fcall('trigger', ['set_rule', new_rule]);
    }, function(){
        if (!val.enabled)
            return;
        update_status();
        if (E.get('status')!='busy')
            return;
        E.once('change:status', function(){ this.continue(); }.bind(this));
        return this.wait(10*SEC);
    }, function(){
        if (val.enabled)
            B.tabs.reload(get_tab_id());
        var d;
        if (val.wait && (d = Date.now()-ts)<val.max_wait)
            return etask.sleep(Math.min(val.max_wait-d, val.wait));
    }, function(){
        be_popup_lib.perr_ok({id: 'be_ui_vpn_script_set_ok', info:
            {name: rule.name, src_country: E.get('country').toLowerCase(),
            root_url: val.root_url, enabled: val.enabled, premium:
            val.premium}});
    }, function catch$(err){
        E.set_err('be_ui_vpn_script_set_err', err);
    }]);
};

function perr_event(action, opt){
    var category = opt.category || 'bext';
    var label = opt.label;
    var id = category+(label ? '_'+label : '')+'_'+action;
    var info_opt = $.extend({src_country:
        E.get('country').toLowerCase()}, opt.info);
    ga.ga_send('event', category, action, label);
    if (!opt.err)
        return be_popup_lib.perr_ok({id: id, info: info_opt});
    return be_popup_lib.perr_err({id: id, info: info_opt});
}

return E;
});
