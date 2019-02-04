// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', '/bext/pub/backbone.js', '/bext/pub/locale.js',
    '/bext/pub/browser.js', '/util/zdot.js', 'text!views/site_trial_try.html',
    'text!views/site_trial_timer.html', '/bext/vpn/pub/util.js',
    '/util/etask.js','/svc/pub/util.js', '/util/date.js',
    '/bext/vpn/pub/util.js', '/bext/pub/popup_lib.js', '/util/storage.js',
    'text!views/site_trial_ended.html'],
    function($, _, be_backbone, T, B, zdot, site_trial_try, site_trial_timer,
    be_util, etask, svc_util, date, be_vpn_util, be_popup_lib, storage,
    site_trial_ended){
B.assert_popup('be_site_trial');
var E = {};

function get_url(){
    return window.hola && window.hola.tpopup_opt &&
        window.hola.tpopup_opt.url;
}

function get_root_url(){ return svc_util.get_root_url(get_url()); }

function get_tab_id(){ return window.hola.tpopup_opt.tab_id; }

function get_tpopup_type(){ return window.hola.tpopup_opt.type; }

function perr(id, is_unique){
    var root_url = get_root_url();
    var storage_name = 'be_site_trial_'+root_url+'_perr_sent_'+id;
    if (is_unique && !storage.get_json(storage_name))
    {
        be_popup_lib.perr_ok({id: id+'_unique'});
        storage.set_json(storage_name, true);
    }
    return be_popup_lib.perr_ok({id: id});
}

E.ended_view_class = be_backbone.view.extend({
    className: 'site_trial_ended',
    events: {'click .cancel': '_on_cancel'},
    template: zdot.template(site_trial_ended),
    initialize: function(){
        this.$el.addClass(this.options.trial_name||'netflix_com');
    },
    render: function(){
        perr('uuid_site_trial_ended_view', true);
        this.$el.html(this.template());
        return be_backbone.view.prototype.render.apply(this);
    },
    _on_cancel: function(){
        perr('uuid_site_trial_ended_cancel');
        this.options.close({root_url: get_root_url(),
            period: 'default',
            src: 'cancel_btn',
            tab_id: get_tab_id(),
            type: get_tpopup_type(),
        });
    },
});

E.try_view_class = be_backbone.view.extend({
    className: 'site_trial_try',
    events: {'click .try': '_on_try', 'click .cancel': '_on_cancel'},
    template: zdot.template(site_trial_try),
    initialize: function(){
        this.$el.addClass(this.options.trial_name||'netflix_com');
    },
    render: function(){
        perr('uuid_site_trial_try_view', true);
        this.$el.html(this.template());
        return be_backbone.view.prototype.render.apply(this);
    },
    _on_try: function(){
        var _this = this;
        perr('uuid_site_trial_try_start');
        etask([function(){
            var root_url = _this.options.root_url || get_root_url();
            if (_this.options.on_try)
                _this.options.on_try();
            return etask.all({
                start: _this.options.be_premium.ecall('start_uuid_trial',
                    [root_url]),
                url: _this.options.be_info.ecall('get_unblock_url',
                    [root_url, 'us']),
            });
        }, function(res){
            B.tabs.update(_this.options.be_tabs.get('active.id'),
                {url: res.url, active: true});
        }]);
    },
    _on_cancel: function(){
        perr('uuid_site_trial_try_cancel');
        this.options.close({root_url: get_root_url(),
            period: 'default',
            src: 'cancel_btn',
            tab_id: get_tab_id(),
            type: get_tpopup_type(),
        });
    },
});

// XXX pavlo: there is a lot of copy-paste here from ui.js. It will be better
// to create common functions to do basic things like disabling vpn for site
// and use them here and in ui.js
E.timer_view_class = be_backbone.view.extend({
    className: 'site_trial_timer',
    events: {
        'click .subscribe': '_on_subscribe',
        'click .cancel': '_on_cancel',
    },
    template: zdot.template(site_trial_timer),
    render: function(){
        perr('uuid_site_trial_timer_view', true);
        if (this.countdown)
            this.countdown.return();
        this.$el.html(this.template({T: T}));
        this.$time = this.$el.find('.time');
        this.$header = this.$el.find('.header');
        this.$countdown = this.$el.find('.countdown');
        this.$countdown_value = this.$el.find('.value');
        this._start_timer();
        return be_backbone.view.prototype.render.apply(this);
    },
    _start_timer: function(){
        var _this = this;
        var RADIUS = 42;
        var CIRCUMFERENCE = 2*Math.PI*RADIUS;
        this.countdown = etask([function(){
            return _this.options.be_premium.ecall('get_uuid_trial_active',
                [get_root_url()]);
        }, function(trial){
            var dur = trial.end-trial.start;
            _this.$countdown_value.css('strokeDasharray', CIRCUMFERENCE);
            _this.$header.text(T('Free trial'));
            return etask.interval(date.ms.SEC, [function(){
                var diff = trial.end-date();
                if (diff<0)
                    return this.break();
                var offset = CIRCUMFERENCE*diff/dur;
                _this.$countdown_value.css('strokeDashoffset', offset);
                _this.$time.text(date.ms_to_dur(diff));
            }]);
        }, function(){
            _this.$header.text(T('Free trial ended!'));
            // jQuery addClass doesn't work for svg
            _this.$countdown[0].classList.add('ended');
        }]);
    },
    _get_enabled_rule: function(){
        var rules = be_vpn_util.get_rules(this.options.be_rule.get('rules'),
            get_url());
        if (!rules || !rules[0] || !rules[0].enabled ||
            !this.options.be_ext.get('r.vpn.on'))
        {
            return null;
        }
        return rules[0];
    },
    _on_subscribe: function(){
        var _this = this;
        etask([function(){
            return perr('uuid_site_trial_timer_subscribe');
        }, function(){
            B.tabs.update(_this.options.be_tabs.get('active.id'),
                {url: 'https://hola.org/plus?ref=holaext-trial-'
                    +get_root_url(), active: true});
        }]);
    },
    _on_cancel: function(){
        perr('uuid_site_trial_timer_cancel');
        var rule = this._get_enabled_rule();
        if (!rule)
            return;
        var new_rule = {name: rule.name, enabled: false,
            country: rule.country, type: rule.type, root_url: get_root_url()};
        return this.options.be_rule.fcall('trigger', ['set_rule', new_rule]);
    },
});

return E; });
