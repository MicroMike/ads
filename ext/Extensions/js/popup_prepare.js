// LICENSE_CODE ZON
'use strict'; /*jslint browser:true*/
(function(){

function init(){
    var is_premium = +localStorage.getItem('ui_cache_is_premium')||0;
    if (is_premium)
        window.document.body.classList.add('user-premium');
}
init();

})();
