// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['/bext/pub/browser.js', '/bext/pub/backbone.js', 'underscore',
    '/util/etask.js', '/util/zerr.js', '/bext/vpn/pub/ajax.js',
    '/bext/pub/lib.js', '/bext/pub/ext.js', '/util/storage.js',
    '/util/date.js', '/util/util.js', '/bext/vpn/pub/info.js',
    '/svc/pub/unblocker_lib.js', '/svc/pub/util.js'],
    function(B, be_backbone, _, etask, zerr, ajax, be_lib, be_ext, storage,
    date, zutil, be_info, unblocker_lib, svc_util){
var conf = window.conf, rules = [], rule_agents = {};
var E = new (be_backbone.task_model.extend({
    _defaults: function(){
        this.on('destroy', function(){
            B.backbone.server.stop('be_agent');
            uninit();
        });
        B.backbone.server.start(this, 'be_agent');
    },
}))();

function init_unblocker(){
    if (init_unblocker.inited || !be_ext.get('gen.get_agents_on'))
        return;
    init_unblocker.inited = true;
    unblocker_lib.init({
        perr: be_lib.perr_err,
        ajax: ajax,
        storage: storage,
        get_auth: be_ext.auth,
        get_ver: be_ext.qs_ajax,
        get_verify_url: function(agent){
            return 'https://'+agent.host+':'+agent.port+'/verify_proxy'; },
    });
}

E.init = function(){
    E.agents = {};
    E.agent_types = {};
    schedule_refresh();
    // refresh agents list when we assume user status changed (free/plus),
    // it can load another type of agents
    var update_agents = _.debounce(function(){
        if (be_ext.get('gen.get_agents_on'))
        {
            init_unblocker();
            unblocker_lib.reset();
        }
        rule_agents = {};
        E.resolve_agents(rules, E.agents);
    }, 2*date.ms.SEC);
    E.listenTo(be_ext, 'change:is_premium', function(){ update_agents(); });
    E.listenTo(be_info, 'user_id_set', function(){ update_agents(); });
    E.listenTo(be_ext, 'change:gen.get_agents_on', init_unblocker);
};

function schedule_refresh(timeout){
    schedule_refresh.timer = clearTimeout(schedule_refresh.timer);
    schedule_refresh.timer = setTimeout(refresh_key, timeout||12*date.ms.HOUR);
}

function refresh_key(){
    if (be_ext.get('gen.get_agents_on'))
        return;
    schedule_refresh.timer = null;
    return etask([function try_catch$(){
        return E.resolve_agents([], {xx: 1}, null, {key_only: 1});
    }, function(){
        schedule_refresh(this.error ? 10*date.ms.MIN : 0);
    }]);
}

function uninit(){
    schedule_refresh.timer = clearTimeout(schedule_refresh.timer);
    if (init_unblocker.inited)
        init_unblocker.inited = void unblocker_lib.uninit();
}

E.is_agent = function(ip){
    if (be_ext.get('gen.get_agents_on'))
        return unblocker_lib.is_agent(ip);
    return !!_.find(E.agents, function(country_agents){
        return zutil.find_prop(country_agents, 'ip', ip); });
};

E.has_pool = function(country, pool){
    if (be_ext.get('gen.get_agents_on'))
        return unblocker_lib.has_pool(country, pool);
    var ap = E.agents[country+'.pool_'+pool];
    return ap && ap.length;
};

// returns agent type from route string
// agent type can be 'hola' for hola agents pool that is used by free users
// and 'vpn' for vpn agents pool used by premium users
//
// route_str - string in a format "xx[.peer]", where xx - country code,
// examples: 'us.peer', 'ca', etc.
// returns 'hola', 'vpn' or undefined if there are no agents for this route
// string
E.get_agents_type = function(route_str){
    return be_ext.get('gen.get_agents_on') ?
        unblocker_lib.get_agents_type(route_str) : E.agent_types[route_str];
};

// gets new agents and agent key
//
// [agent_specs] - dict in the format 'proxy string: true', where
// 'proxy string' has the format xx[.peer|.pool_bbc].
// Example: {us.peer: true, ua: true, gb.pool_bbc: true}.
// If set, function will request agents for proxy strings from this list. If
// not set, function will request agents for proxy strings w/o agents from
// E.agents.
// [exclude] - list of agent names to exclude. Example: ['zagent1.hola.org'].
// [opt.key_only] - get only agent key. Doesn't get new agents.
var resolve_agents_old = function(agent_specs, exclude, opt){
    var new_only = !agent_specs;
    opt = opt||{};
    agent_specs = agent_specs || E.agents;
    return etask([function(){
        if (_.isEmpty(agent_specs))
            return this.return();
        // sites have different algorithms for the various urls, we need
        // to make sure that we always choose the same agent
        var zgettunnels = {};
        _.keys(agent_specs).forEach(function(agent_spec){
            if (new_only && E.agents[agent_spec].length)
                return;
            zgettunnels[agent_spec] = 1;
        });
        if (!(zgettunnels=_.keys(zgettunnels)).length)
            return this.return();
        var limit, data = {exclude: exclude ? exclude.join(',') : undefined};
        if (limit = zutil.get(be_ext.get('bext_config'),
            'verify_proxy.agent_num', 3))
        {
            data.limit = limit;
        }
        zgettunnels = zgettunnels.join(';');
        zerr.debug('zgettunnels country %s data %O', zgettunnels, data);
        return ajax.json({url: conf.url_ccgi+'/zgettunnels',
            qs: be_ext.auth({country: zgettunnels}), data: data, retry: 1});
    }, function(ret){
        zerr.debug('zgettunnels response %O', ret);
        be_ext._set('agent_key', ret.agent_key);
        storage.set('agent_key', ret.agent_key);
        if (opt.key_only)
            return;
        for (var z in ret.ztun)
        {
            if (!ret.ztun[z].length)
            {
                be_lib.perr_ok({id: 'all_agents_failed',
                    info: {country_str: z}});
            }
            var route_str = z.toLowerCase();
            E.agents[route_str] = ret.ztun[z].map(function(str){
                var match = str.match(/.* (.*):(.*)/);
                var host = match[1];
                if (exclude && _.contains(exclude, host))
                {
                    be_lib.perr_err({id: 'exclude_peer_ignored',
                        info: {country_str: z, host: host}});
                }
                return {
                    host: host,
                    port: match[2],
                    ip: ret.ip_list[match[1]],
                };
            });
            E.agent_types[route_str] = ret.agent_types[route_str];
        }
        zerr.info('agents set to %O', E.agents);
    }]);
};

E.set_rules = function(r){ rules = r; };

E.get_chosen_agent = function(route_str, rule){
    if (!be_ext.get('gen.get_agents_on'))
        return E.agents[route_str];
    var agent;
    if (rule && (agent = rule_agents[route_str]))
    {
        unblocker_lib.update_chosen(agent);
        if (!rule.is_updating)
        {
            rule.is_updating = true;
            etask([function(){ E.get_agents(rule);
            }, function finally$(){ rule.is_updating = false;
            }]);
        }
    }
    return agent ? [agent] : [];
};

// XXX nikita: mv to unblocker_lib.js
var get_rule_routes = function(rule){
    var route_str = [];
    route_str.push(svc_util.gen_route_str_lc({country: rule.country,
        peer: false, pool: rule.pool}));
    if (E.get_agents_type(rule.country)!='vpn' && rule.peer)
    {
        route_str.push(svc_util.gen_route_str_lc({country: rule.country,
            peer: rule.peer, pool: rule.pool}));
    }
    return route_str;
};

E.get_active_agents = function(rule){
    var agents = [];
    get_rule_routes(rule).forEach(function(s){
        agents = agents.concat(E.get_chosen_agent(s)); });
    return agents;
};

var set_verified_agents = function(ret){
    var agent, routes = (ret||{}).verify_proxy;
    for (var s in routes)
    {
        if (agent = zutil.get((routes[s]||[])[0], 'agent'))
            rule_agents[s] = _.pick(agent, 'host', 'port', 'ip');
    }
};

E.resolve_agents = function(r, agent_specs, exclude, opt){
    if (!be_ext.get('gen.get_agents_on'))
        return resolve_agents_old(agent_specs, exclude, opt);
    opt = opt||{};
    opt.replace = exclude;
    var rule;
    var fr = agent_specs ? r : r.filter(function(iter){
        return !rule_agents[svc_util.gen_route_str_lc(iter)]; });
    return etask([function(){
        return etask.for_each(fr, [function(){
            rule = this.iter.val;
            return unblocker_lib.change_agents(null, rule, opt);
        }, set_verified_agents]);
    }, function catch$(e){
        be_lib.perr_err({id: 'resolve_agents_err', info: {rule: rule,
            err: e}});
    }]);
};

E.get_agents = function(rule){
    return etask({name: '_verify_proxy', cancel: true}, [function(){
        return unblocker_lib.get_agents(null, rule);
    }, set_verified_agents, function catch$(e){
        be_lib.perr_err({id: 'get_agents_err', info: {rule: rule, err: e}});
    }]);
};

return E; });
