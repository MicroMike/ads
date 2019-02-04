// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
define(['/bext/pub/browser.js', '/bext/pub/backbone.js',
    '/bext/vpn/pub/info.js', '/bext/pub/tabs.js', '/svc/pub/util.js'],
    function(B, be_backbone, be_info, be_tabs, svc_util){
var chrome = window.chrome;
var E = new be_backbone.model();

function add_to_context_menu(){
    if (!chrome||!chrome.contextMenus)
        return;
    // we can't easily clear only dev menu items, so we clear all
    chrome.contextMenus.removeAll();
    chrome.contextMenus.create({
        id: 'hola-vpn-dev-tpopup',
        title: 'Show tpopup',
        contexts: ['browser_action'],
        onclick: function(){
            var tab_url = be_tabs.get('active.url');
            var tab_id = be_tabs.get('active.id');
            if (!tab_url||!tab_id)
                return;
            var domain = svc_util.get_root_url(tab_url);
            be_info.set_force_tpopup(domain);
            chrome.tabs.reload(tab_id);
        }
    });
}

E.enable = function(){ E.set('dev_mode', true); };

E.init = function(){
    E.on('change:dev_mode', function(){ add_to_context_menu(); });
    if (!window.zon_config._RELEASE)
        E.set('dev_mode', true);
};

return E; });
