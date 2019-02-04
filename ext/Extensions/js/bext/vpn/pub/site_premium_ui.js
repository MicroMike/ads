// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', '/bext/pub/backbone.js', '/bext/pub/locale.js',
    '/bext/pub/browser.js', '/util/zdot.js',
    'text!views/site_premium_promote.html', '/bext/vpn/pub/util.js',
    '/util/etask.js', '/svc/pub/util.js', '/util/date.js',
    '/bext/vpn/pub/util.js', '/bext/pub/popup_lib.js', '/util/storage.js',
    '/bext/vpn/pub/ui_obj.js', '/util/zerr.js'],
    function($, _, be_backbone, T, B, zdot, site_premium, be_util, etask,
    svc_util, date, be_vpn_util, be_popup_lib, storage_name, be_ui_obj, zerr)
{
B.assert_popup('be_site_premium');

function get_url(){
    return window.hola && window.hola.tpopup_opt &&
        window.hola.tpopup_opt.url;
}

function get_tab_id(){ return window.hola.tpopup_opt.tab_id; }
function get_tpopup_type(){ return window.hola.tpopup_opt.type; }

var E = be_backbone.view.extend({
    className: 'site_premium',
    events: {
        'click .try': '_on_try',
        'click .image': '_on_try',
        'click .title': '_on_try',
        'click .subtitle': '_on_try',
        'click .cancel': '_on_cancel',
    },
    template: zdot.template(site_premium),
    initialize: function(options){
        this.options = options;
        this.$el.addClass(this._get_id());
        this.close_button = new be_ui_obj.close_button({
            root_url: this._get_root_url(), close: this.options.close});
    },
    _get_root_url: function(){
        return this.options.root_url || svc_util.get_root_url(get_url());
    },
    render: function(){
        this._perr('uuid_site_premium_view');
        $('#header').addClass('no-border');
        $('#footer').hide();
        this.$el.html(this.template({
            T: T,
            trial_ended: this.options.trial_ended,
            root_url: this._get_root_url(),
            show_cancel: !!this.options.close,
        }));
        if (this.options.close)
            this.$el.append(this.close_button.render().$el);
        this._use_intro_animation();
        return be_backbone.view.prototype.render.apply(this);
    },
    _use_intro_animation: function(){
        var _this = this;
        function add_anim(){ _this.$el.addClass('intro_animation'); }
        if (window.is_tpopup)
            setTimeout(add_anim, 500);
        else
            add_anim();
    },
    _on_try: function(){
        this._perr('uuid_site_premium_subscribe');
        var _this = this;
        etask([function(){ return _this._get_try_url();
        }, function(url){
            B.tabs.update(_this.options.be_tabs.get('active.id'), {url: url,
                active: true});
            if (_this.options.on_try)
                _this.options.on_try();
        }, function catch$(err){
            return be_popup_lib.perr_err({id: 'site_premium_ui_try_err',
                info: ''+err});
        }]);
    },
    _get_try_url: function(){
        var ref = [];
        if (this.options.unsupported)
            ref.push('unsupported');
        var is_plus_trial, _this = this;
        if (_this.options.be_ext.get('test_trial3_on'))
            ref.push('test_trial3_on');
        else if (_this.options.be_ext.get('test_trial3_off'))
            ref.push('test_trial3_off');
        ref.push('require_plus');
        ref.push(_this._get_id());
        return 'https://hola.org/plus?ref='+ref.join('_');
    },
    _on_cancel: function(){
        this._perr('uuid_site_premium_cancel');
        this.options.close({root_url: this._get_root_url(),
            period: 'default',
            src: 'cancel_btn',
            tab_id: get_tab_id(),
            type: get_tpopup_type(),
        });
    },
    _perr: function(id){
        return be_popup_lib.perr_ok({id: id, info: {
            root_url: this._get_root_url(),
        }});
    },
    _get_id: function(){
        return this._get_root_url().replace(/\./g, '_');
    },
    remove: function(){
        $('#header').removeClass('no-border');
        $('#footer').show();
        return be_backbone.view.prototype.remove.apply(this);
    },
});

return E;
});
