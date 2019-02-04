// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['/bext/pub/locale.js', 'jquery', '/bext/pub/lib.js',
    '/bext/pub/backbone.js', '/bext/pub/browser.js', '/util/etask.js',
    '/bext/pub/tabs.js', '/util/zerr.js', '/util/date.js',
    '/svc/account/pub/membership.js', '/bext/pub/ext.js', '/bext/pub/util.js',
    '/bext/vpn/pub/mode.js', '/bext/vpn/pub/ajax.js', '/util/util.js',
    '/bext/vpn/pub/dev_mode.js', '/util/version_util.js', '/util/storage.js'],
    function(T, $, be_lib, be_backbone, B, etask, be_tabs, zerr, date,
    membership, be_ext, be_util, be_mode, ajax, zutil, dev_mode, version_util,
    storage){
var E = new (be_backbone.task_model.extend({
    _defaults: function(){
	this.on('destroy', function(){
	    B.backbone.server.stop('be_premium');
	    uninit();
	});
	B.backbone.server.start(this, 'be_premium');
    },
}))();
var is_ff = be_util.browser_guess.browser=='firefox';
var membership_timeout, _membership, daily_refresh_timer, conf = window.conf;
var trials = [], trial_usage = 0;
var premium_link = 'https://hola.org/premium.html?utm_source=holaext'
    +'&ref={{medium}}_';
var promos = [
    {text: 'Get Unlimited Unblocking',
        link: premium_link+'get_unlimited_unblocking'},
    {text: 'Get 24/7 Unblocking', link: premium_link+'get_24_7_unblocking'},
    {text: 'Access more sites', link: premium_link+'access_more_sites'},
    {text: 'Love Hola?', link: premium_link+'love_hola'},
    {text: 'Go Hola PLUS', link: premium_link+'go_hola_premium'},
    {text: 'Upgrade', link: premium_link+'upgrade'},
    {text: 'Never be a peer', link: premium_link+'never_be_a_peer'},
    {text: 'Support Hola', link: premium_link+'support_hola'},
    {text: 'Get PLUS support', link: premium_link+'get_premium_support'},
    {text: 'Get Hola for Android',
        link: 'https://play.google.com/store/apps/details?'
        +'id=org.hola&referrer=utm_source%3Dbext%26'
        +'utm_medium%3D{{medium}}'},
    {text: 'Invite friends - free PLUS',
        link: 'https://hola.org/referral.html?ref=popup&utm_source=holaext'}
];

E.get_promo = function(medium){
    var promo;
    if (membership===undefined || membership.is_active(_membership))
        return {text: ''};
    promo = promos[Math.floor(Math.random()*promos.length)];
    return {text: T(promo.text),
	link: promo.link.replace('{{medium}}', medium)};
};

E.is_active = function(){
    return membership.is_active(_membership)||E.is_uuid_trial_active(); };

E.is_paid = function(){ return membership.is_paid(_membership); };

E.is_trial_ended = function(){
    return membership.is_trial(_membership) &&
        membership.is_expired(_membership);
};

E.logout_user = function(){
    return ajax.hola_api_call('users/logout/inline', {method: 'POST',
        text: true});
};

// refreshes user and his premium status
// opt.force_premium - set to force premium status refresh, otherwise it will
// be checked only if user changed
E.refresh_user = function(opt){
    opt = opt||{};
    var user_id = be_ext.get('user_id'), new_user_id;
    return etask({name: 'refresh_user', cancel: true}, [function(){
        return ajax.hola_api_call('users/get_user', {
            data: {uuid: be_ext.get('uuid'),
            source: 'be_premium',
            cid: be_mode.get('svc.cid')||undefined}});
    }, function(_user){
        new_user_id = zutil.get(_user, 'user._id');
        be_ext.set('user_id', new_user_id);
        E.set('user', _user&&_user.user);
    }, function(){
        if (user_id!=new_user_id || opt.force_premium)
            return ajax.hola_api_call('users/payment/get_membership');
    }, function(__membership){
        var old_is_active = E.is_active();
        _membership = __membership;
        be_ext.set('is_premium', E.is_active());
        if (opt.exp_synced && old_is_active!==E.is_active())
        {
            be_lib.perr(zerr.L.ERR, {id: 'premium_out_of_sync',
                info: {membership: _membership}});
        }
        be_lib.perr(zerr.L.NOTICE, {id: 'membership',
            info: {membership: _membership, user: E.get('user')}});
        return _membership;
    }, function catch$(err){
        be_lib.perr(zerr.L.ERR, {id: 'refresh_user_fail',
            info: zerr.e2s(err)});
        clearTimeout(membership_timeout);
        membership_timeout = setTimeout(function(){
	    E.sp.spawn(E.refresh_user(opt)); }, Math.random()*date.ms.HOUR);
    }]);
};

function is_force_rule_for_country(rule, country){
    if (!country)
        return true;
    if (rule.countries)
        return rule.countries.includes(country);
    if (rule.exclude_countries)
        return !rule.exclude_countries.includes(country);
    return true;
}

// XXX colin/shachar: move google to be in blacklist
function is_google(root_url){
    return root_url.split('.')[0]=='google';
}

// XXX arik: ui.js <--> premium.js
function is_blacklist(root_url, host){
    if (!root_url)
        return false;
    host = host||root_url; // XXX arik HACK: fixme
    if (be_ext.get('is_premium'))
        return false;
    // XXX colin: if blacklisted make sure to disable rule for root_url of url
    var blacklist = (E.be_rule.get('rules')||{}).blacklist||{};
    return is_google(root_url) || blacklist[host] || blacklist[root_url];
}

function get_force_rule(conf_name, root_url, opt){
    if (is_blacklist(root_url))
    {
        // XXX arik: quick hack for blacklist domain
        rule = {id: root_url, domain: new RegExp(root_url), blacklist: true};
        return rule;
    }
    opt = opt||{};
    var force_conf = (be_ext.get('bext_config')||{})[conf_name]||{};
    var src_country = storage.get('src_country');
    var rule = (force_conf.rules||[]).find(function(r){
        if (!r.domain.test(root_url))
            return false;
        return is_force_rule_for_country(r, src_country);
    });
    if (!rule)
        return false;
    var install_ver = storage.get('install_version');
    if (!opt.ignore_install_version && rule.install_ver_min && install_ver &&
        version_util.cmp(install_ver, rule.install_ver_min)<0)
    {
        return false;
    }
    return rule;
}

E.get_force_premium_rule = get_force_rule.bind(this, 'force_premium');
E.get_force_privacy_rule = get_force_rule.bind(this, 'get_privacy');

// gets trial periods attached to current uuid
function get_uuid_trials(){
    return etask('get_uuid_trials', [function(){
        var auth = be_ext.auth();
        if (!auth || !auth.uuid || !auth.session_key)
        {
            be_lib.perr(zerr.L.NOTICE, {id: 'empty_user_session'});
            return this.return();
        }
        return ajax.json({url: conf.url_ccgi+'/get_trials', qs: auth});
    }, function(_trials){
        if (!_trials || !Array.isArray(_trials))
            return;
        trials = _trials;
        monitor_active_trial();
    }]);
}

// starts trial attached to uuid
E.start_uuid_trial = function(root_url){
    return etask('start_uuid_trial', [function(){
        return ajax.json({url: conf.url_ccgi+'/start_trial',
            qs: Object.assign({name: root_url}, be_ext.auth())});
    }, function(_trials){
        if (!_trials || !Array.isArray(_trials))
            return;
        trials = _trials;
        monitor_active_trial();
        return trials.find(function(t){ return t.name==root_url; });
    }]);
};

// monitors client trial each second and unsets is_premium when ended
var trial_monitor;
function monitor_active_trial(){
    if (trial_monitor)
        return;
    trial_monitor = etask({async: true}, [function(){
        return etask.interval(date.ms.SEC, [function(){
            be_ext.set('is_premium', E.is_active());
            if (!E.is_uuid_trial_active())
            {
                if (trial_usage>0)
                {
                    be_lib.perr_ok({id: 'uuid_site_trial_usage',
                        info: {sec: trial_usage}});
                }
                trial_usage = 0;
                return this.break();
            }
            if (E.is_uuid_trial_using())
                trial_usage++;
        }]);
    }, function finally$(){
        trial_monitor = null;
    }]);
    E.sp.spawn(trial_monitor);
}

// whether client has available trial for site
E.is_uuid_trial_available = function(root_url){
    // XXX pavlo/sergeir: premium in FF is buggy, check tab_unblocker.js
    if (is_ff)
        return false;
    if (!dev_mode.get('dev_mode') &&
        !(be_ext.get('bext_config')||{}).trial_enabled)
    {
        return false;
    }
    // XXX pavlo: when you will add support for new sites, check that other
    // trials are not active now, because we allow only one active trial at a
    // time
    return !trials.some(function(t){ return t.name==root_url; });
};

// checks whether client has active trial
// [root_url] - if not passed, will check root url of currently active trial
E.is_uuid_trial_active = function(root_url){
    return trials.some(function(t){
        if (root_url && root_url!=t.name)
            return false;
        return t.end>date();
    });
};

E.is_uuid_trial_ended = function(root_url){
    return trials.some(function(t){
        if (root_url!=t.name)
            return false;
        return t.end<=date();
    });
};

// gets active trial
E.get_uuid_trial_active = function(root_url){
    return trials.find(function(t){
        return t.name==root_url && t.end>date(); });
};

// checks if user is now using trial (trial active, page opened, vpn enabled)
// [root_url] - if not passed, will check root url of currently active trial
E.is_uuid_trial_using = function(root_url){
    var is_active = false;
    if (root_url)
        is_active = E.is_uuid_trial_active(root_url);
    else
    {
        var trial = trials.find(function(t){ return t.end>date(); });
        if (!trial)
            return false;
        root_url = trial.name;
        is_active = true;
    }
    if (!is_active)
        return false;
    if (!be_tabs.has_root_url(root_url))
        return false;
    var rules = E.be_rule.get_rules('http://'+root_url+'/');
    var rule = rules && rules[0];
    return rule && rule.enabled && rule.country=='us';
};

E.init = function(be_rule){
    // XXX pavlo: can't require it because of circular dependency issue
    E.be_rule = be_rule;
    E.sp = etask('be_premium', [function(){ return this.wait(); }]);
    E.sp.spawn(E.refresh_user());
    daily_refresh_timer = setInterval(
        E.refresh_user.bind(E, {force_premium: true}), date.ms.DAY);
    E.listenTo(be_ext, 'change:session_key', get_uuid_trials);
    E.listenTo(be_tabs, 'updated', function(obj){
        if (!obj.info.url)
            return;
        if (obj.info.url.match(/^https:\/\/hola.org\/premium.html/))
        {
            /* When paying using PayPal, the user may complete a purchase
             * without reaching the thank you page, or reach it before the
             * IPN is received and the membership updated */
            _membership = undefined;
            clearTimeout(membership_timeout);
            membership_timeout = setTimeout(function(){
		E.sp.spawn(E.refresh_user({force_premium: true}));
            }, date.ms.HOUR);
        }
    });
};

function uninit(){
    E.sp.return();
    clearTimeout(membership_timeout);
    clearInterval(daily_refresh_timer);
}

return E; });
