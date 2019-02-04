// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'underscore', 'backbone', '/bext/pub/backbone.js',
    '/util/etask.js', '/bext/pub/ext.js', '/bext/pub/util.js',
    '/util/zerr.js', '/bext/pub/browser.js', '/bext/vpn/pub/util.js',
    '/bext/pub/lib.js', '/util/version_util.js',
    '/bext/vpn/pub/tab_unblocker.js', '/util/url.js', '/util/escape.js',
    '/bext/vpn/pub/ajax.js', '/util/array.js', '/bext/vpn/pub/defines.js',
    '/svc/pub/util.js', '/bext/vpn/pub/agent.js', '/bext/vpn/pub/mode.js',
    '/util/storage.js', '/bext/vpn/pub/rules.js', '/bext/pub/tabs.js',
    '/util/date.js', '/util/util.js', '/bext/vpn/pub/info.js'],
    function($, _, Backbone, be_backbone, etask, be_ext, be_util, zerr, B,
    be_vpn_util, be_lib, version_util, be_tab_unblocker, zurl, zescape, ajax,
    array, be_defines, svc_util, be_agent, be_mode, storage, be_rules,
    be_tabs, date, zutil, be_info){
var be_bg_main = window.be_bg_main, be_bg = window.be_bg||{};
var SEC = date.ms.SEC;
B.assert_bg('be_rule');
var chrome = window.chrome, conf = window.conf, assign = Object.assign;
var vp_conf = {};
var E = new (be_backbone.task_model.extend({
    rules: undefined,
    _defaults: function(){
        this.on('destroy', function(){
            B.backbone.server.stop('be_rule');
            uninit();
        });
        B.backbone.server.start(this, 'be_rule');
    },
}))();
// XXX amir: temp workaround for mutual dependency
be_tab_unblocker.be_rule = E;

E.tasks = [];

// XXX arik: how to properly cancel tasks;
E.task_cancel_all = function(){
    _.forEach(E.tasks, function(task){ task.return(); }); };
E.task_insert = function(task){ E.tasks.push(task); };
E.task_remove = function(task){ array.rm_elm(E.tasks, task); };

function uninit(){
    if (!E.get('inited'))
        return;
    E.sp.return();
    E.off();
    E.stopListening();
    E.task_cancel_all();
    E.rules = undefined;
}

E.init = function(be_vpn){
    if (E.get('inited'))
        return;
    E.be_vpn = be_vpn;
    E.set('inited', true);
    E.sp = etask('be_rule', [function(){ return this.wait(); }]);
    E.agent_auth_listener_add();
    E.on('recover', function(){ E.trigger('fetch_rules'); });
    E.listen_to(be_ext, 'change:r.vpn.on change:r.ext.enabled '+
        'change:auth.stamp',
        _.debounce(function(){ E.trigger('fetch_rules'); }));
    E.listen_to(be_ext, 'change:bext_config', function(){
        vp_conf = zutil.get(be_ext.get('bext_config'), 'verify_proxy', {});
    });
    E.listenTo(be_tabs, 'completed error_occured', function(info){
        if (!info || !info.tabId)
            return;
        var fix_task = fix_tasks[info.tabId];
        if (!fix_task)
            return;
        if (!fix_task.fix_waiting)
            return;
        fix_task.continue();
    });
};

E.get_rules = function(url){ return be_vpn_util.get_rules(E.rules, url); };

E.get_rule_ratings = function(args){
    return ajax.json({slow: 2*SEC,
        url: conf.url_ccgi+'/rule_ratings', data: be_ext.qs_ajax(args),
        perr: function(opt){ return be_lib.perr_err(opt); }});
};

E.get_groups_from_ratings = function(ratings){
    return etask({name: 'get_groups_from_ratings', cancel: true}, [function(){
        var groups = [];
        ratings.forEach(function(cr){
            cr.rules.forEach(function(r){
                if (r.rating<=0)
                    return;
                groups.push(_.pick(r, 'name', 'type', 'md5', 'country'));
            });
        });
        if (!groups.length)
            return;
        return be_rules.get_groups(groups);
    }, function(groups){
        if (!groups || !groups.unblocker_rules)
            return groups;
        _.forEach(groups.unblocker_rules, function(r){ delete r.enabled; });
        return groups;
    }]);
};

function _fetch_rules_rmt(){
    E.task_cancel_all();
    E.unset('verify_proxy_ret');
    return etask([function(){
        zerr.notice('be_rule: fetch_rules');
        if (!be_ext.get('r.ext.enabled'))
        {
            E.rules = undefined;
            return this.goto('done');
        }
    }, function(){
        // XXX shachar: change to min rules request
        var opt = {url: conf.url_ccgi+'/rules_get_vpn.json', qs: be_ext.auth(),
            data: {}, retry: 1};
        return ajax.json(opt);
    }, function(rules){
        be_rules.set_rules(rules);
        E.rules = be_rules.get_rules();
        E.set('rules', E.rules);
    }, function done(){
        return be_tab_unblocker.update_rule_urls(E.rules);
    }, function(){ E.set('stamp', E.rules ? E.rules.stamp : 0);
    }]);
}

E.fetch_rules = function(){
    var rules;
    if (!(rules=be_rules.get_rules()))
        return _fetch_rules_rmt();
    zerr.notice('be_rule: fetch_rules local');
    if (!E.fetch_once)
    {
        E.fetch_once = true;
        _fetch_rules_rmt(); // background fetch
    }
    if (!be_ext.get('r.ext.enabled'))
        E.rules = undefined;
    else
    {
        E.rules = rules;
        E.set('rules', E.rules);
    }
    return etask([function(){
        return be_tab_unblocker.update_rule_urls(E.rules);
    }, function(){ E.set('stamp', E.rules ? E.rules.stamp : 0);
    }]);
};

E.on('fetch_rules', function(){
    if (!E.get('inited'))
        return;
    E.task_cancel_all();
    if (!E.set_busy({desc: 'Changing country...'}))
        return E.schedule_clr(['fetch_rules']);
    var auth = be_ext.auth();
    if (!auth.uuid || !auth.session_key)
        return E.clr_busy();
    E.sp.spawn(etask({name: 'fetch_rules', cancel: true}, [function(){
        return E.fetch_rules();
    }, function(){ E.clr_busy();
    }, function catch$(err){
        E.set_err();
        be_lib.err('be_script_fetch_rules_err', '', err);
    }]));
});

E.set_rule = function(opt){
    be_rules.set_rule(opt);
    E.sp.spawn(etask({cancel: true}, [function(){
        E.task_insert(this);
        zerr.notice('set_rule '+zerr.json(opt));
        return ajax.json({qs: be_ext.auth(), method: 'POST',
            url: conf.url_ccgi+'/rule_set.json', data: opt});
    }, function(e){
        var login_url = e.login_url;
        if (login_url)
        {
            var active_url = be_tabs.get('active.url');
            if (active_url && svc_util.get_root_url(active_url)==opt.name)
                B.tabs.update(be_tabs.get('active.id'), {url: login_url});
        }
    }, function finally$(){
        E.task_remove(this);
    }]));
};

E.on('set_rule', function(opt){
    if (!E.get('inited'))
        throw new Error('set_rule failed, be_rule not inited');
    E.task_cancel_all();
    if (!E.set_busy({desc: opt.enabled ? 'Finding peers...' :
        'Stopping peer routing...'}))
    {
        return E.schedule(['set_rule', opt]);
    }
    E.sp.spawn(etask({name: 'set_rule', cancel: true}, [function(){
        return E.set_rule(opt);
    }, function(){
        E.update_progress({desc: 'Changing country...'});
        return E.fetch_rules();
    }, function(){
        var r = svc_util.find_rule(E.rules&&E.rules.unblocker_rules, opt);
        var is_enabled = r&&r.enabled;
        if (!!is_enabled != !!opt.enabled)
        {
            be_lib.perr_err({id: 'be_set_rule_mismatch',
                info: {opt: opt, r: r, hola_uid: be_ext.get('hola_uid')}});
        }
        if (!opt.enabled)
            return;
        return E.verify_proxy({desc: 'rule_set', rule: opt,
            zgettunnels_retry: be_defines.ZGETTUNNELS_RETRY,
            root_url: opt.root_url});
    }, function(){
        E.clr_busy();
        be_lib.perr_ok({id: 'be_set_rule_ok', info: {name: opt.name,
            type: opt.type, md5: opt.md5, country: opt.country,
            enabled: opt.enabled, hola_uid: be_ext.get('hola_uid')}});
    }, function catch$(err){
        E.set_err();
        be_lib.err('be_script_set_rule_err', '', {err: err,
            hola_uid: be_ext.get('hola_uid')});
    }]));
});

function get_agent_req(ping_id, agent, opt){
    var t0 = Date.now();
    function get_result(res){
        res = assign({agent: agent}, res);
        if (zutil.get(res, 'res.err', '').includes('timeout'))
            res.timeout = true;
        return res;
    }
    return etask({name: 'get_agent_req', cancel: true}, [function(){
        ping_id = agent.ip+'_'+ping_id;
        return ajax.json({timeout: 9*SEC, slow: 2*SEC,
            url: 'https://'+agent.host+':'+agent.port+'/verify_proxy',
            data: be_ext.qs_ajax({proxy_country: opt.rule.country,
            ping_id: ping_id, root_url: opt.root_url||''})});
    }, function(ret){ return get_result({res: ret, t: Date.now()-t0});
    }, function catch$(err){
        return get_result({res: {error: 'ping', err: ''+err},
            t: Date.now()-t0});
    }]);
}

function get_status(ping_id, agents, opt, et){
    var res = [];
    return etask({name: 'get_status', cancel: true}, [function(){
        this.on('finally', function(){
            if (et)
                et.continue(res);
        });
        for (var i = 0; i<agents.length; i++)
            this.spawn(get_agent_req(ping_id, agents[i], opt));
        return this.wait_child('any', function(info){
            if (!info || !info.res)
                return;
            res.push(info = assign({}, info, _.pick(info.res, 'error',
                'err')));
            if (info.error)
            {
                if (res.length==1)
                {
                    verify_proxy_perr('first_fail', opt, {ping_id: ping_id,
                        agent: info.agent.host, res: info.res}, true);
                }
                if (info.timeout)
                {
                    verify_proxy_perr('fail_timeout', opt, {ping_id: ping_id,
                        agent: info.agent.host, res: info.res}, true);
                }
                return;
            }
            if (be_ext.get('vp.bw_check'))
            {
                var link, bw = info.agent.bw_available = info.res.bw_available;
                if (opt.root_url)
                {
                    link = (be_tab_unblocker.get_bw_rule_by_host(opt.root_url)
                        ||{}).link;
                }
                var def_link = be_ext.get('vp.def_link')||3;
                if (bw<link || !link && bw<def_link)
                {
                    if (res.length==1)
                    {
                        verify_proxy_perr('first_fail_bw', opt, {res: info.res,
                            ping_id: ping_id, agent: info.agent.host}, true);
                    }
                    if (bw<def_link)
                        return void(info.warn = 'low_bw');
                }
            }
            if (et)
                et = void et.continue([info]);
        });
    }, function(){
        var failed = res.filter(function(e){ return e.error; });
        if (failed.length)
        {
            exclude_failed(opt.rule, function(a){
                return failed.some(function(e){ return e.agent==a; }); });
            if (failed.length==res.length)
            {
                verify_proxy_perr('all_fail', opt, {ping_id: ping_id,
                    agents: failed}, true);
                failed = res.filter(function(e){ return e.timeout; });
                if (failed.length==res.length)
                {
                    verify_proxy_perr('all_fail_timeout', opt, {agents: failed,
                        ping_id: ping_id}, true);
                }
            }
        }
        return res;
    }]);
}

function get_verified(ping_id, agents, opt){
    return etask({name: 'get_verified', cancel: true}, [function(){
        var et = get_status(ping_id, agents, opt, this);
        this.on('cancel', function(){ et.return(); });
        return this.wait();
    }]);
}

function is_rule_active(rule){
    return Object.keys(be_tab_unblocker.tab_unblockers).some(function(t){
        return be_tab_unblocker.tab_unblockers[t].rule.name==rule.name;
    });
}

function get_rule_agents(rule){
    var rule_info, route_str = [], agents = {};
    var proxy = be_vpn_util.gen_route_str({country: rule.country,
        peer: false, pool: rule.pool}).toLowerCase();
    // XXX nikita: premium is forced for vpn type
    if (be_agent.get_agents_type(rule.country)=='vpn')
        route_str.push(proxy);
    else
    {
        if (rule.peer)
            route_str.push(proxy);
        if (rule_info = be_tab_unblocker.get_rule_info(rule))
            route_str.push(rule_info.country_str);
    }
    route_str.forEach(function(e){ agents[e] = be_agent.agents[e]||[]; });
    return agents;
}

function get_verified_proxy(ping_id, agents, opt){
    var d, len = 0;
    for (var route in agents)
        len += agents[route].length;
    if (!len && (d = get_no_agent_delay()))
        return etask.sleep(d*SEC);
    return etask({name: 'get_verified_proxy', cancel: true}, [function(){
        var route, tasks = {};
        for (route in agents)
            tasks[route] = get_verified(ping_id, agents[route], opt);
        return etask.all(tasks);
    }, function catch$(err){
        return {info: {error: 'catch', err: ''+err}};
    }]);
}

// XXX arik: create shorter id
function get_ping_id(){ return Math.random(); }

E.is_enabled = function(rule){
    if (!rule) // XXX arik: should never happen
        return true;
    if (!E.rules || !E.rules.unblocker_rules)
        return false;
    var r = svc_util.find_rule(E.rules.unblocker_rules, rule);
    return r && r.enabled;
};

function get_no_agent_delay(){ return vp_conf.no_agent_delay||10; }

function verify_proxy_perr(name, opt, info, err){
    var loc = be_info.get('location');
    info = assign({desc: opt.desc, prev_desc: opt.prev_desc,
        root_url: opt.root_url, rule: _.omit(opt.rule, 'cmds'),
        proxy_country: opt.rule.country, hola_uid: be_ext.get('hola_uid'),
        zgettunnels_retry: opt.zgettunnels_retry,
        src_country: loc&&loc.country}, info);
    be_lib['perr_'+(err ? 'err' : 'ok')]({info: info,
        id: 'be_verify_proxy_'+name});
}

// XXX shachar/colin: verify proxy code is called from various places, need to
// make sure that ping requests are synced with actual site being unblocked by
// be_tab_unblocker (see mail from me and be_tab_unblocker.ajax_via_proxy).
// - sending ajax without rule being unblocked or having an agent causes it to
//   be sent direct.
// - need to make sure only one verify proxy is running for a root_url.
//
// talk with arik when starting to get additional comments and pointers about
// the required changes to the verify code.
function _verify_proxy(opt){
    if (!E.is_enabled(opt.rule))
        return void zerr('tab:%d verify_proxy cancelled %O', opt.tab_id, opt);
    var ping_id = get_ping_id(), ts = Date.now();
    var agents = get_rule_agents(opt.rule), rule = _.omit(opt.rule, 'cmds');
    var info = {ping_id: get_ping_id(), rule_agents: agents};
    E.unset('verify_proxy_ret');
    return etask({name: '_verify_proxy', cancel: true}, [function(){
        E.task_insert(this);
        E.update_progress({desc: 'Testing connection...'});
        verify_proxy_perr('attempt', opt, info);
        zerr.debug('tab:%d verify proxy %O %O', opt.tab_id, zutil.pick(rule,
            'id', 'name', 'country', 'description', 'peer'), agents);
        return get_verified_proxy(ping_id, agents, opt);
    }, function(e){
        e = e||{};
        var low_bw = [], verified = [], ex = [];
        var ret = {verify_proxy: {}, proxy_country: opt.rule.country,
            rule: rule};
        for (var route in e)
        {
            ex = ex.concat(agents[route]);
            ret.verify_proxy[route] = e[route];
            var v;
            if (!(v = e[route]) || !v.length)
            {
                ret.error = 'no_agents';
                continue;
            }
            if (!v[0].error && !v[0].warn && v[0].agent)
            {
                verified.push({route: route, agent: v[0].agent});
                continue;
            }
            v = v.filter(function(a){ return !a.error && a.agent; });
            if (!v.length)
            {
                ret.error = 'all_fail';
                continue;
            }
            v = v.sort(function(a, b){
                return b.agent.bw_available-a.agent.bw_available; });
            verified.push({route: route, agent: v[0].agent});
            low_bw.push(v[0].agent.host);
        }
        E.set('verify_proxy_ret', ret);
        zerr.debug('tab:%d verify proxy response %O', opt.tab_id, ret);
        if (ret.error)
        {
            verified = [];
            ex = ex.map(function(e){ return e.host; });
        }
        else
            ex = verified.map(function(e){ return e.agent.host; });
        assign(info, {verify_proxy: ret.verify_proxy, exec_ms: Date.now()-ts,
            agents: ex});
        if (verified.length)
        {
            if (low_bw.length)
                verify_proxy_perr('all_fail_bw', opt, info, true);
            use_verified(verified, info);
        }
        _verify_proxy.total = (_verify_proxy.total||0)+1;
        if (!ret.error)
            verify_proxy_perr('ok', opt, info);
        else
        {
            _verify_proxy.errors = (_verify_proxy.errors||0)+1;
            assign(info, {proxy_errors: _verify_proxy.errors, error: ret.error,
                proxy_total: _verify_proxy.total, exclude: opt.exclude,
                ext_enabled: be_ext.get('r.ext.enabled'),
                is_rule_enabled: !!E.is_enabled(opt.rule)});
            if (opt.zgettunnels_retry)
            {
                // XXX nikita: check if needed
                verify_proxy_perr('err', opt, info, true);
                zerr('tab:%d verify_proxy failed, trying auto-recover',
                    opt.tab_id);
                return _change_proxy_old({rule: opt.rule, desc: 'auto_recover',
                    prev_desc: opt.desc, force_change: true,
                    zgettunnels_retry: opt.zgettunnels_retry-1,
                    exclude: (opt.exclude||[]).concat(ex),
                    root_url: opt.root_url, verify_proxy_ret: ret});
            }
            verify_proxy_perr('err_final', opt, info, true);
        }
        return ret;
    }, function finally$(){ E.task_remove(this); }]);
}

// XXX arik/bahaa: fix status handling and use etask instead of schedule
E.verify_proxy_wait = function(opt){
    return etask({name: 'verify_proxy_wait', cancel: true}, [function(){
        if (E.get('status')!='busy')
            return E.verify_proxy(opt);
        E.once('change:status', function(){
            this.continue(E.verify_proxy(opt)); }.bind(this));
        return this.wait();
    }]);
};

function delete_tunnel(opt){
    return etask({name: 'delete_tunnel', cancel: true}, [function(){
        return be_tab_unblocker.ajax_via_proxy({type: 'GET', timeout: 10*SEC,
            rule: opt.rule,
            url: 'http://'+opt.root_url+
            '.trigger.hola.org/hola_trigger?proxy_tunnel_del&_='+
            Math.random()});
    }, function catch$(err){
        be_lib.perr_err({id: 'be_delete_tunnel_err', info: opt, err: err});
    }]);
}

var exclude = [];
function change_proxy_ext(opt){
    var len = 0, agents = get_rule_agents(opt.rule);
    for (var route in agents)
    {
        len += agents[route].length;
        agents[route] = [];
    }
    if (!len && !exclude.length)
    {
        be_lib.perr_err({id: 'missing_agent', info: {opt: opt}});
        zerr('missing agent '+opt.rule.country);
        return E.fetch_rules();
    }
    opt.exclude = _.union(opt.exclude||[], exclude);
    exclude = [];
    return be_agent.resolve_agents([opt.rule], agents, opt.exclude);
}

function exclude_failed(rule, is_failed){
    var agent, no_agents, agents = get_rule_agents(rule);
    for (var route in agents)
    {
        var res = [];
        for (var i = 0; i<agents[route].length; i++)
        {
            agent = agents[route][i];
            if (is_failed(agent, i))
                exclude = _.union(exclude, agent.host);
            else
                res.push(agent);
        }
        if (!res.length)
            no_agents = true;
        be_agent.agents[route] = res;
    }
    return no_agents;
}

function use_verified(verified, info){
    for (var i = 0; i<verified.length; i++)
    {
        var idx, active = be_agent.agents[verified[i].route]||[];
        if ((idx = active.indexOf(verified[i].agent))==-1)
        {
            be_lib.perr_err({id: 'be_verify_proxy_agent_not_found',
                info: assign({agent: verified[i].agent}, info)});
            continue;
        }
        verified[i].agent.verified = true;
        if (idx)
        {
            active.splice(idx, 1);
            active.unshift(verified[i].agent);
        }
    }
}

function _change_proxy_old(opt){
    if (!E.is_enabled(opt.rule))
        return void zerr('_change_proxy_old cancelled', opt);
    var tunnel = (opt.verify_proxy_ret||{}).tunnel;
    var tunnel_error = tunnel && tunnel.error=='tunnel';
    return etask({name: '_change_proxy_old', cancel: true}, [function(){
        E.task_insert(this);
        E.update_progress({desc: 'Trying another peer...'});
        if (tunnel_error)
            return delete_tunnel(opt);
    }, function(){
        if (opt.force_change)
            return change_proxy_ext(opt);
        if (exclude_failed(opt.rule, function(a, i){
            return !i && a.verified; }))
        {
            return change_proxy_ext(opt);
        }
    }, function(){ return _verify_proxy(opt);
    }, function finally$(){ E.task_remove(this); }]);
}

function _change_proxy(opt){
    if (!E.is_enabled(opt.rule))
        return void zerr('_change_proxy cancelled', opt);
    return etask({name: '_change_proxy', cancel: true}, [function(){
        E.task_insert(this);
        E.update_progress({desc: 'Trying another peer...'});
        var exclude = be_agent.get_active_agents(opt.rule);
        return be_agent.resolve_agents([opt.rule], undefined, exclude,
            _.pick(opt, 'user_not_working'));
    }, function finally$(){ E.task_remove(this); }]);
}

function get_agents(opt){
    if (!E.is_enabled(opt.rule))
        return void zerr('get_agents cancelled', opt);
    // XXX nikita: rm when enabled by default
    E.unset('verify_proxy_ret');
    return etask({name: 'get_agents', cancel: true}, [function(){
        E.task_insert(this);
        return be_agent.get_agents(opt.rule);
    }, function finally$(){ E.task_remove(this); }]);
}

E.verify_proxy = function(opt){
    if (opt.rule.changing_proxy)
        return;
    opt.rule.changing_proxy = true;
    return etask({name: 'verify_proxy', cancel: true}, [function(){
        return be_ext.get('gen.get_agents_on') ? get_agents(opt) :
            _verify_proxy(opt);
    }, function finally$(){ opt.rule.changing_proxy = false; }]);
};

E.change_proxy = function(opt){
    if (opt.rule.changing_proxy)
        return;
    opt.rule.changing_proxy = true;
    return etask({name: 'change_proxy', cancel: true}, [function(){
        return be_ext.get('gen.get_agents_on') ? _change_proxy(opt) :
            _change_proxy_old(opt);
    }, function finally$(){
        opt.rule.changing_proxy = false;
    }]);
};

function fix_vpn_perr(opt){
    var info = assign({
        src_country: opt.src_country,
        url: opt.url,
        root_url: opt.root_url,
        proxy_country: (opt.rule.country||'').toLowerCase(),
        zagent_log: E.be_vpn.get('zagent_conn_log')||[],
        callback_raw: be_mode.get('svc.callback_raw'),
        callback_ts: be_mode.get('svc.callback_ts'),
        mode_change_count: be_mode.get('mode_change_count'),
        multiple_mode_changes: be_mode.get('mode_change_count')>2,
        real_url: be_tabs.get('active.url'),
        status: be_tabs.get('active.status'),
    }, _.pick(opt.rule, 'name', 'type', 'md5'));
    if (!be_ext.get('gen.get_agents_on'))
    {
        var p = E.get('verify_proxy_ret')||{};
        assign(info, {tunnel: p.tunnel&&p.tunnel.tunnel, proxy_error: p.error,
            agent: (p.basic||p.verify_proxy||{}).agent});
    }
    else
        info.agent = be_agent.get_active_agents(opt.rule);
    return etask([function(){ return be_tabs.get_trace(opt.tab_id);
    }, function(trace){
        if (trace && trace.length)
            info.page_load = trace[trace.length-1].duration;
        return info;
    }, function finally$(){
        be_lib.perr_err({id: 'be_fix_vpn_script_not_work', info: info});
    }]);
}

var fix_tasks = {};
E.fix_vpn = function(opt){
    opt = opt||{};
    var info, timeout = Date.now(), tab_id = opt.tab_id;
    if (fix_tasks[tab_id])
        fix_tasks[tab_id].return();
    return fix_tasks[tab_id] = etask({cancel: true, async: true}, [function(){
        return fix_vpn_perr(opt);
    }, function(perr_info){
        info = perr_info;
        return E.change_proxy_wait({rule: opt.rule, desc: 'not_working',
            root_url: opt.root_url, user_not_working: true,
            zgettunnels_retry: be_defines.ZGETTUNNELS_RETRY,
            verify_proxy_ret: E.get('verify_proxy_ret')});
    }, function(){
        // XXX arik/shachar hack: temporary hack till fixing tab_unblocker
        // to reload relevant tabs after zagent update
        B.tabs.reload(tab_id);
        var proxy_timeout = Date.now()-timeout;
        if (proxy_timeout<10*SEC)
            return true;
        return this.return();
    }, function get_trace(){ return be_tabs.get_trace(tab_id);
    }, function(trace){
        var last_trace = trace && trace.length && trace[trace.length-1];
        var status = last_trace && last_trace.status;
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
    }, function catch$(err){
        this.fix_waiting = false;
        be_lib.perr_err({id: 'be_fix_vpn_script_fix_rule', info: info,
            err: err});
    }]);
};

// XXX arik/bahaa: fix status handling and use etask instead of schedule
E.change_proxy_wait = function(opt){
    return etask({name: 'change_proxy_wait', cancel: true}, [function(){
        if (E.get('status')!='busy')
            return E.change_proxy(opt);
        E.once('change:status', function(){
            this.continue(E.change_proxy(opt)); }.bind(this));
        return this.wait();
    }]);
};

function gen_user_login(){
    var cid = be_mode.get('svc.cid'), uuid = be_ext.get('uuid');
    return 'user-'+(cid ? 'cid-'+cid+'-' : '')+'uuid-'+uuid;
}

function _agent_auth_listener_cb(){
    var _key = be_ext.get('agent_key'), key = _key||storage.get('agent_key');
    var err = _key ? null : key ? 'be_agent_key_fallback' : 'be_no_agent_key';
    if (err)
        be_lib.perr_err({id: err, rate_limit: {count: 2}});
    if (key)
        return {username: gen_user_login(), password: key};
}

function agent_auth_listener_cb(details){
    if (!details.isProxy || details.realm!='Hola Unblocker')
        return {};
    return {authCredentials: _agent_auth_listener_cb()};
}
function agent_auth_via_headers_cb(opt){
    for (var i=0; i<opt.requestHeaders.length; i++)
    {
        if (opt.requestHeaders[i].name.toLowerCase() == 'proxy-authorization')
            return {requestHeaders: opt.requestHeaders};
    }
    var cred = _agent_auth_listener_cb();
    if (cred)
    {
        var value = btoa(cred.username+':'+cred.password);
        opt.requestHeaders.push({
            name: 'Proxy-Authorization',
            value: 'Basic '+value
        });
    }
    return {requestHeaders: opt.requestHeaders};
}

E.agent_auth_listener_del = function(){
    if (!be_bg.agent_auth_listener)
        return;
    if (chrome.webRequest.onAuthRequired)
    {
        chrome.webRequest.onAuthRequired.removeListener(
            be_bg.agent_auth_listener);
    }
    else
    {
        chrome.webRequest.onBeforeSendHeaders.removeListener(
            be_bg.agent_auth_listener);
    }
    be_bg.agent_auth_listener = null;
};

E.agent_auth_listener_add = function(){
    // - extension version is too old. auth handler is set locally
    if (!B.have.auth_listener)
        return;
    E.agent_auth_listener_del();
    if (chrome.webRequest.onAuthRequired)
    {
        be_bg.agent_auth_listener = agent_auth_listener_cb;
        chrome.webRequest.onAuthRequired.addListener(agent_auth_listener_cb,
            {urls: ['<all_urls>']}, ['blocking']);
    }
    else
    {
        be_bg.agent_auth_listener = agent_auth_via_headers_cb;
        chrome.webRequest.onBeforeSendHeaders.addListener(
            agent_auth_via_headers_cb, {urls: ['<all_urls>']}, ['blocking',
            'requestHeaders']);
    }
};

return E; });
