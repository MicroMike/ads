// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['jquery', 'bootstrap', '/bext/pub/backbone.js', '/bext/pub/browser.js',
    '/util/zerr.js', '/bext/pub/popup_lib.js', '/bext/pub/util.js',
    '/bext/pub/locale.js', '/util/escape.js', '/util/etask.js', 'underscore',
    '/util/storage.js', 'purl', '/util/util.js'],
    function($, bootstrap, be_backbone, B, zerr, be_popup_lib, be_util, T,
    zescape, etask, _, storage, purl, zutil){
var chrome = window.chrome;
var E = new (be_backbone.model.extend())();

function ver_info(){
    var $mailto;
    var $info = $('<div>'), $el = $('<div>').append($info);
    function add_line(s, val){
        $('<div>').append($('<span>').text(s), $('<span>').text(val))
            .appendTo($info);
    }
    var report_div = $('<div>');
    report_div.append($('<a>')
        .text(T('Report a problem'))
        .addClass('btn btn-default')
        .click(function(e){
            be_popup_lib.perr_err({id: 'be_report_problem',
                info: {perr: 1}, rate_limit: {count: 1}});
            $('#report_modal').modal('show');
        }));
    report_div.append($('<span>').text(T('or send email to ')),
        $mailto = $('<a>', {href: be_util.problem_mailto_url(add_line)})
	.text('help_be@hola.org')
	.click(function(e){
            be_popup_lib.perr_err({id: 'be_report_problem',
                info: {email: 1}, rate_limit: {count: 1}});
            if (chrome)
                return;
            e.preventDefault();
            var link = $(e.target).attr('href');
            /* for firefox open in new window which will offer to send with
             * gmail, yahoo, etc.. if no mail client present */
            window.open(link, '_blank', 'resizable');
        }))
    .appendTo($info);
    if (chrome)
    {
        /* workaround mailto links not working in chrome about */
        $mailto.attr('target', 'report_mailto_frame');
        $info.append($('<iframe>', {id: 'report_mailto_frame'}).hide());
    }
    return $el;
}

function parse_dev_cmds(){
    var qs;
    try { qs = $.url().data.param.query; } catch(e){ return; }
    _.each(qs, function(v, k){
        if (!k.startsWith('storage.'))
            return;
        k = k.substr(8); // 'storage.'.length
        if (v)
            storage.set(k, v);
        else
            storage.clr(k);
    });
}

var dev_mode_counter = 0;
function dev_mode_init(){
    if (!E.R.be_dev_mode)
        return;
    $('#title').on('click', function(){
        dev_mode_counter++;
        if (dev_mode_counter!=5)
            return;
        E.R.be_dev_mode.fcall('enable');
        window.alert('Dev mode activated.');
    });
}

function post_init(){
    window.RMT = E.R; // XXX amir: fix nicely
    zerr.notice('l.about inited');
    $('.content').append(ver_info());
    dev_mode_init();
    parse_dev_cmds();
    report_init();
}

function send_report(subj, desc){
    var info = {subj: subj, desc: desc};
    var be_bg_main;
    if (be_bg_main = window.be_bg_main)
        info.bg_log = be_bg_main.get_log();
    be_popup_lib.perr_ok({id: 'be_issue_report', info: info});
}

function report_init(){
    var $modal = $('#report_modal');
    $modal.find('.modal-footer .btn-default').click(function(e){
        $inputs.val('');
        $modal.modal('hide');
    });
    var $inputs = $modal.find('[name=subj], [name=desc]');
    function on_change(){
        var filled = $inputs.toArray().every(function(inp){
            return !/^\s*$/.test($(inp).val()); });
        $modal.find('.modal-footer .btn-primary').prop('disabled', !filled);
    }
    $inputs.on('keydown', on_change);
    $inputs.on('change', on_change);
    $inputs.on('focus', on_change);
    $modal.find('.modal-footer .btn-primary').click(function(e){
        etask([function(){
            return send_report($modal.find('[name=subj]').val(),
                $modal.find('[name=desc]').val());
        }, function(){
            $inputs.val('');
            $modal.modal('hide');
        }]);
    });
}

E.init = function(){
    if (E.inited)
        return;
    E.inited = true;
    $(window).on('unload', function(){ E.uninit(); });
    B.init({context: null});
    etask([function bg_ping(){
        E.et = this;
        if (!B.use_msg)
            return this.goto('got_bg');
        return etask.cb_apply(B.backbone.client, '.ping', ['be_bg_main', 500]);
    }, function(ret){
        if (!ret.error)
            return this.continue();
        zerr('l.popup ping bg failed %s', zerr.json(ret));
        return this.goto('bg_ping');
    }, function got_bg(){
	zerr.notice('l.about got bg');
	E.be_bg_main = B.backbone.client.start('be_bg_main');
        if (B.use_msg)
            return wait_for(E.be_bg_main, '_backbone_client_started', true);
    }, function(){
        return wait_for(E.be_bg_main, 'inited', true);
    }, function(){
        if (!B.use_msg)
            return E.R = B.bg && B.bg.RMT;
        E.R = B.backbone.client.start('RMT');
        return wait_for(E.R, '_backbone_client_started', true, 500);
    }, function(){
        if (!B.use_msg)
            return;
        E.R.be_ext = B.backbone.client.start('be_ext');
        return wait_for(E.R.be_ext, '_backbone_client_started', true, 500);
    }, function(){
        if (!B.use_msg)
            return;
        E.R.be_mode = B.backbone.client.start('be_mode');
        return wait_for(E.R.be_mode, '_backbone_client_started', true, 500);
    }, function catch$(err){
        if (E.R && err=='timeout')
            return;
        throw err;
    }, function(){
        setTimeout(post_init);
    }, function catch$(err){
        zerr('be_about_main_init_err', err);
    }, function finally$(){
        E.et = null;
    }]);
};

E.uninit = function(){
    if (!E.inited)
	return;
    E.inited = false;
    if (E.et)
        E.et.return();
    B.backbone.client.stop('be_bg_main');
    B.backbone.client.stop('RMT');
    B._destroy();
    E.off();
    E.stopListening();
};

// XXX bahaa/arik: add to be_backbone?
function wait_for(obj, key, val, timeout){
    var l;
    return etask([function(){
        var _this = this;
        E.listen_to(obj, 'change:'+key, l = function(){
            if (obj.get(key)===val)
                _this.continue();
        });
        return this.wait(timeout);
    }, function finally$(){
        E.stopListening(obj, 'change:'+key, l);
    }]);
}

return E; });
