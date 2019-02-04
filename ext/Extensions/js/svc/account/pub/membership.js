// LICENSE_CODE ZON
'use strict'; /*jslint node:true, browser:true*/
(function(){
var define;
var is_node = typeof module=='object' && module.exports;
if (!is_node)
    define = self.define;
else
    define = require('../../../util/require_node.js').define(module, '../');
define([], function(){
var E = {};

// extra days for a case when automatic payment comes lately
E.grace = 1;

function get_end_by_period(membership, opt){
    opt = opt||{};
    var end = new Date(membership.start);
    if (membership.period=='1 M')
        end.setUTCMonth(end.getUTCMonth()+1);
    else if (membership.period=='6 M')
        end.setUTCMonth(end.getUTCMonth()+6);
    else if (membership.period=='1 Y')
        end.setUTCFullYear(end.getUTCFullYear()+1);
    else if (membership.period=='2 Y')
        end.setUTCFullYear(end.getUTCFullYear()+2);
    else if (membership.period=='3 Y')
        end.setUTCFullYear(end.getUTCFullYear()+3);
    else
        throw 'Unexpected period: '+membership.period;
    if (!opt.disable_grace)
        end.setUTCDate(end.getUTCDate()+E.grace);
    return end;
}

E.get_end_by_period = get_end_by_period;

E.get_end_date = function(membership){
    var end = membership && (membership.end || membership.trial_end ||
        membership.grace_end || membership.start && membership.period &&
        get_end_by_period(membership));
    return end ? new Date(end) : null;
};

E.is_active = function(membership){
    if (!membership)
        return false;
    if (membership.trial_end && Date.now()<=new Date(membership.trial_end))
        return true;
    if (membership.grace_end && Date.now()<=new Date(membership.grace_end))
        return true;
    if (membership.end && Date.now()<=new Date(membership.end))
        return true;
    if (membership.start && membership.period &&
        Date.now()<=get_end_by_period(membership))
    {
        return !membership.cancelled || !membership.end;
    }
    return false;
};

E.is_in_trial = function(membership){
    return E.is_trial(membership) && Date.now()<new Date(membership.trial_end);
};

E.is_trial = function(membership, type){
    return !!membership && !!membership.trial_end &&
        (!type || type==(membership.type||'start'));
};

E.is_in_grace = function(membership){
    return E.is_grace(membership) && Date.now()<new Date(membership.grace_end);
};

E.is_grace = function(membership, type){
    return !!membership && !!membership.grace_end &&
        (!type || type==(membership.type||'start'));
};

E.had_premium = function(history){
    return !!history && history.some(function(h){ return !E.is_trial(h); });
};

E.had_trial = function(history, type){
    return !!history && history.some(function(h){
        return E.is_trial(h, type); });
};

E.had_grace = function(history, type){
    return !!history && history.some(function(h){
        return E.is_grace(h, type); });
};

E.trial_forbidden = function(membership, history, type){
    if (E.is_in_trial(membership))
        return 'trial exists';
    if (E.is_trial(membership, type))
        return 'trial expired';
    if (E.is_active(membership))
        return 'already premium';
    if (E.had_premium(history))
        return 'had premium';
    if (E.had_trial(history, type))
        return 'had trial';
    return false;
};

E.grace_period_forbidden = function(membership, history, type){
    if (E.is_in_grace(membership))
        return 'grace exists';
    if (E.is_grace(membership, type))
        return 'grace expired';
    if (E.is_active(membership))
        return 'already premium';
    if (E.had_grace(history, type))
        return 'had grace';
    return false;
};

E.is_paid = function(membership){
    return !!membership && !!membership.gateway; };

E.is_expired = function(membership){
    var end_date = E.get_end_date(membership);
    return !!end_date && Date.now()>end_date;
};

E.classify = function(membership){
    if (E.is_active(membership))
        return E.is_in_trial(membership) ? 'trial' : 'premium';
    if (E.is_expired(membership))
        return E.is_trial(membership) ? 'trial_expired' : 'premium_expired';
    return 'free';
};

E.gen_email_hash = function(email, md5){
    return md5('hola unsubscribe '+email).substr(0, 8);
};

return E; }); }());
