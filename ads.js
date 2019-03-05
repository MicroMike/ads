// EUX0XJ8RP2MLB84KHYESIMH
const fs = require('fs-extra')
var shell = require('shelljs');
const puppet = require('./puppet')

process.setMaxListeners(Infinity)

const adsArr = [
  [2466954, 2466952, 2466950, 2466948, 2466946, 2466944, 2466942, 2466940, 2466938, 2466936],
  [2467157, 2467155, 2467153, 2467151, 2467149, 2467147, 2467143, 2467141, 2467138, 2467136],
  [2467235, 2467230, 2467228, 2467226, 2467224, 2467222, 2467220, 2467218, 2467216, 2467214],
]

const domains = [
  { url: 'barcut-salon', type: 0 },
  { url: 'yogalife', type: 0 },
  { url: 'conf-business', type: 0 },
]

let browsers = 0

let over = false
const CRX_PATH = 'C:\\Users\\mike\\workspace\\ads\\ext\\Extensions'

const logTime = () => {
  const date = new Date()
  return date.getUTCHours() + 1 + 'H' + date.getUTCMinutes()
}

const rand = (max, min) => {
  return Math.floor(Math.random() * Math.floor(max) + (typeof min !== 'undefined' ? min : 0));
}

const urls = [
  '//newhigee.net/ntfc.php?p=*&tco=1',
  '//boacheeb.com/ntfc.php?p=*&tco=1',
  '//zoagremo.net/ntfc.php?p=*&tco=1',
  '//letaikay.net/ntfc.php?p=*&tco=1',
  '//chaghets.net/ntfc.php?p=*&tco=1',
  '//leechiza.net/ntfc.php?p=*&tco=1',
  '//thoorest.com/ntfc.php?p=*&tco=1',
  '//pastoupt.com/ntfc.php?p=*&tco=1',
  '//joophesh.com/ntfc.php?p=*&tco=1',
  '//cimoghuk.net/ntfc.php?p=*&tco=1',
  '//whirgoom.com/ntfc.php?p=*&tco=1',
]

const customUrls = [
  '//pushnevis.com/ntfc.php?p=*',
  '//pushlum.com/ntfc.php?p=*'
]

const vpn = ['denu', 'defr1', 'defr2', 'deda', 'nlth', 'nlam', 'nlro', 'ukdo', 'ukel', 'ukbe', 'uklo', 'ukke', 'ukbe2', 'ukwe', 'usny', 'uswd', 'uswd2', 'usnj1', 'ussf', 'usch', 'usda', 'usmi', 'usla3', 'usla2', 'usnj3', 'usse', 'usmi2', 'usde', 'ussl', 'uskc', 'usta1', 'usph', 'usla1', 'usvi', 'usny2', 'usnj2', 'usho', 'usda2', 'usmi', 'usbo', 'usla', 'ussj', 'usat', 'usla5', 'usla4', 'ussf', 'ussf2', 'frst', 'frpa1', 'frpa2', 'itmi', 'itco', 'se1', 'se2', 'ch2', 'ch1', 'ro1', 'cato', 'cava', 'cato2', 'camo', 'im1', 'mx1', 'br2', 'br1', 'pa1', 'esma', 'esba', 'tr1', 'ie1', 'cl1', 'ar1', 'cr1', 'co1', 've1', 'ec1', 'is1', 'no1', 'dk1', 'be1', 'fi1', 'gr1', 'pt1', 'at1', 'ru1', 'am1', 'pl1', 'lt1', 'lv1', 'ee1', 'cz1', 'ad1', 'inmu1', 'in1', 'inch', 'za1', 'me1', 'ba1', 'lu1', 'hu1', 'bg1', 'by1', 'ua1', 'mt1', 'li1', 'cy1', 'sgju', 'sgcb', 'sgmb', 'hk2', 'hk1', 'hk3', 'hk4', 'hk6', 'hk5', 'jpto3', 'jpto2', 'jpto1', 'aume', 'ausy', 'ausy3', 'aupe', 'aubr', 'ausy2', 'krsk2', 'krsk', 'ph1', 'my1', 'al1', 'hr1', 'si1', 'sk1', 'mc1', 'il1', 'lk1', 'pk1', 'kz1', 'th1', 'id1', 'nz1', 'tw3', 'twvh', 'twvh2', 'vn1', 'mo1', 'kh1', 'mn1', 'lala', 'mm1', 'np1', 'gt1', 'pe1', 'uy1', 'bs1', 'je1', 'mk1', 'mdmo', 'rs1', 'ge1', 'az1', 'kg1', 'eg1', 'ke1', 'dz1', 'uz1', 'bd1', 'bt1', 'bnbr']

const launch = async (retry) => {
  if (over) { return }

  const tmp = 'save/' + 1 + Math.random()
  const domainId = rand(domains.length)
  const domain = domains[domainId].url
  const ads = adsArr[domainId]
  const urlsArr = domains[domainId].type ? customUrls : urls

  fs.ensureDir(tmp + '/Default', async (err) => {
    if (err !== null) { console.log(err) }

    try {
      await fs.copy(rand(2) ? 'Preferences' : 'PreferencesNo', tmp + '/Default/Preferences')
    }
    catch (e) {
      return
    }

    let page

    try {
      page = await puppet(tmp)
    }
    catch (e) { }

    browsers++
    let el = true

    try {
      await page.gotoUrl('https://' + domain + '.herokuapp.com/')
      if (ads) {
        await page.addScriptTag({
          url: urlsArr[rand(urlsArr.length)].replace('*', ads[rand(ads.length)])
        })
        await page.wfs('iframe')
        await page.waitFor(1000 * 5 + rand(1000 * 5))
        el = await page.evaluate(() => {
          const el = document.querySelector('iframe').contentDocument.querySelector('#A button + button')
          document.querySelector('iframe').contentDocument.querySelector('#A button + button') && document.querySelector('iframe').contentDocument.querySelector('#A button + button').onclick()
          return !!el
        })
      }

      if (!el) { throw 'error' }

      if (retry) {
        console.log(domain, 'ok')
      }

      await page.waitFor(ads ? 1000 * 10 : 1000)
      await page.cls()
      browsers--
    }
    catch (e) {
      browsers--
      console.log('close ' + e)
      await page.cls()
    }
  })
}

const loop = async () => {
  fs.remove('save', async (err) => {
    const ip = vpn[rand(vpn.length)]
    console.log('Start: ' + ip, logTime())

    shell.exec('expressvpn disconnect', { silent: true })
    const reconnect = shell.exec('expressvpn connect ' + ip, { silent: true })

    if (/Unable/.test(reconnect.stderr) || /Unable/.test(reconnect.stdout)) {
      console.log('Fail: ' + ip)
      await loop()
    }
  })
}

let time = 0
const addTime = 1000 * 7

const multi = async () => {
  if (over) { return }

  time += addTime

  if (time >= 1000 * 60 * 5) {
    if (browsers === 0) {
      await loop()
      time = 0
    }
  }
  else {
    if (browsers < 10) {
      await launch()
    }
  }

  setTimeout(() => {
    multi()
  }, addTime);
}

fs.remove('save', async (err) => {
  await loop()
  multi()
})

process.on('SIGINT', function (code) {
  over = true
});

process.on('exit', function (code) {
  over = true
  console.log(logTime())
});
