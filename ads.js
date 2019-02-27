const puppeteer = require('puppeteer');
const fs = require('fs-extra')
var shell = require('shelljs');

process.setMaxListeners(Infinity)

const adsArr = [[
  2453299,
  2453297,
  2453295,
  2453293,
  2453291,
  2453289,
  2453287,
  2453285,
  2453283,
  2453281,
], [
  2453352,
  2453350,
  2453348,
  2453346,
  2453344,
  2453342,
  2453340,
  2453338,
  2453336,
  2453332,
]]

const domains = [
  'barcut-salon',
  'barcut-salon',
  'deluxe-hotel',
  'yogalife',
]

let over = false
const CRX_PATH = 'C:\\Users\\mike\\workspace\\ads\\ext\\Extensions'

const logTime = () => {
  const date = new Date
  return date.getUTCHours() + 1 + 'H' + date.getUTCMinutes()
}

const rand = (max, min) => {
  return Math.floor(Math.random() * Math.floor(max) + (typeof min !== 'undefined' ? min : 0));
}

const ua = [
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36',
  'Mozilla/5.0 (Linux; Android 7.0; Moto G (4) Build/NPJS25.93-14-18) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36',
]

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

const vpn = [
  'denu',
  'defr1',
  'defr2',
  'deda',
  'nlth',
  'nlam',
  'nlro',
  'ukdo',
  'ukel',
  'ukbe',
  'uklo',
  'ukke',
  'ukbe2',
  'ukwe',
  'usny',
  'uswd',
  'uswd2',
  'usnj1',
  'ussf',
  'usch',
  'usda',
  'usmi',
  'usla3',
  'usla2',
  'usnj3',
  'usse',
  'usmi2',
  'usde',
  'ussl',
  'uskc',
  'usta1',
  'usph',
  'usla1',
  'usvi',
  'usny2',
  'usnj2',
  'usho',
  'usda2',
  'usmi',
  'usbo',
  'usla',
  'ussj',
  'usat',
  'usla5',
  'usla4',
  'ussf',
  'ussf2',
  'frst',
  'frpa1',
  'frpa2',
  'itmi',
  'itco',
  'se1',
  'se2',
  'ch2',
  'ch1',
  'ro1',
  'cato',
  'cava',
  'cato2',
  'camo',
  'im1',
  'mx1',
  'br2',
  'br1',
  'pa1',
  'esma',
  'esba',
  'tr1',
  'ie1',
  'cl1',
  'ar1',
  'cr1',
  'co1',
  've1',
  'ec1',
  'is1',
  'no1',
  'dk1',
  'be1',
  'fi1',
  'gr1',
  'pt1',
  'at1',
  'ru1',
  'am1',
  'pl1',
  'lt1',
  'lv1',
  'ee1',
  'cz1',
  'ad1',
  'inmu1',
  'in1',
  'inch',
  'za1',
  'me1',
  'ba1',
  'lu1',
  'hu1',
  'bg1',
  'by1',
  'ua1',
  'mt1',
  'li1',
  'cy1',
  'sgju',
  'sgcb',
  'sgmb',
  'hk2',
  'hk1',
  'hk3',
  'hk4',
  'hk6',
  'hk5',
  'jpto3',
  'jpto2',
  'jpto1',
  'aume',
  'ausy',
  'ausy3',
  'aupe',
  'aubr',
  'ausy2',
  'krsk2',
  'krsk',
  'ph1',
  'my1',
  'al1',
  'hr1',
  'si1',
  'sk1',
  'mc1',
  'il1',
  'lk1',
  'pk1',
  'kz1',
  'th1',
  'id1',
  'nz1',
  'tw3',
  'twvh',
  'twvh2',
  'vn1',
  'mo1',
  'kh1',
  'mn1',
  'lala',
  'mm1',
  'np1',
  'gt1',
  'pe1',
  'uy1',
  'bs1',
  'je1',
  'mk1',
  'mdmo',
  'rs1',
  'ge1',
  'az1',
  'kg1',
  'eg1',
  'ke1',
  'dz1',
  'uz1',
  'bd1',
  'bt1',
  'bnbr',
]

const launch = async (retry) => {
  if (over) { return }

  const tmp = 'save/' + 1 + Math.random()
  const domainId = rand(domains.length)
  const domain = domains[domainId]
  const ads = adsArr[domainId]

  fs.ensureDir(tmp + '/Default', async (err) => {
    if (err !== null) { console.log(err) }

    await fs.copy(rand(2) ? 'Preferences' : 'PreferencesNo', tmp + '/Default/Preferences')
    const params = {
      // executablePath: '/usr/bin/google-chrome-stable',
      userDataDir: tmp,
      headless: false,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        //   `--disable-extensions-except=${CRX_PATH}`,
        //   `--load-extension=${CRX_PATH}`,
        '--disable-translate',
        '--window-position=0,0',
        '--window-size=300,300',
        '--user-agent=' + ua[rand(ua.length)],
      ]
    }

    let browser

    // params.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

    try {
      browser = await puppeteer.launch(params);
    }
    catch (e) {
      console.log(e)
      return
    }

    const pages = await browser.pages()
    const page = pages[0]

    await page.evaluateOnNewDocument(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => false,
      });
    });

    await page.setRequestInterception(true);
    page.on('request', async request => {
      const requestUrl = await request.url()
      if (request.resourceType() === 'image' && !/svg$/.test(requestUrl)) {
        return request.abort(['blockedbyclient']);
      }
      request.continue();
    });

    page.gotoUrl = async (url) => {
      try {
        await page.goto(url, { timeout: 1000 * 60 * 5, waitUntil: 'domcontentloaded' })
        return true
      } catch (error) {
        throw 'error connect'
      }
    }

    page.wfs = async (selector, timeout = 1000 * 60 * 3, retry = false) => {
      try {
        await page.waitForSelector(selector, { timeout })
        return true
      } catch (e) {
        throw 'Selector :' + selector + ' not found'
      }
    }

    page.ext = async (selector, timeout = 1000 * 10) => {
      try {
        await page.waitForSelector(selector, { timeout })
        return true
      } catch (error) {
        return false
      }
    }

    page.clk = async (selector) => {
      const exist = await page.wfs(selector)

      try {
        await page.waitFor(2000 + rand(2000))
        await page.evaluate(selector => {
          document.querySelector(selector) && document.querySelector(selector).click()
        }, selector)

        return true
      }
      catch (e) {
        console.log('Click error ' + selector, 'exist :' + exist)
        return false
      }
    }

    page.jClk = async (selector) => {
      const exist = await page.ext(selector)
      if (!exist) { return false }

      try {
        await page.waitFor(2000 + rand(2000))
        await page.evaluate(selector => {
          document.querySelector(selector) && document.querySelector(selector).click()
        }, selector)
        return true
      }
      catch (e) {
        console.log('Justclick ' + selector)
      }

    }

    page.inst = async (selector, text) => {
      await page.clk(selector)

      try {
        await page.waitFor(2000 + rand(2000))
        const elementHandle = await page.$(selector);
        await page.evaluate(selector => {
          document.querySelector(selector).value = ''
        }, selector)
        await elementHandle.type(text, { delay: 300 });

        return true
      }
      catch (e) {
        console.log('Insert error ' + selector)
      }
    }

    page.get = async (selector) => {
      const exist = await page.wfs(selector)

      try {
        await page.waitFor(2000 + rand(2000))
        const links = await page.evaluate(selector => {
          const list = document.querySelectorAll(selector)
          const arr = Array.prototype.slice.call(list).map(el => el.href)
          return arr
        }, selector)

        return links
      }
      catch (e) {
        console.log('Click error ' + selector, 'exist :' + exist)
        return false
      }
    }

    page.cls = async () => {
      try {
        await page.goto('about:blank')
        await page.close()
      }
      catch (e) {
        console.log('Can\'t close')
      }
    }

    let el = true

    try {
      await page.gotoUrl('https://' + domain + '.herokuapp.com/')
      if (ads) {
        await page.addScriptTag({
          url: urls[rand(urls.length)].replace('*', ads[rand(ads.length)])
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

      await page.waitFor(1000 * 10 + rand(1000 * 20))
      await page.cls()
    }
    catch (e) {
      console.log(e)
      await page.cls()
    }
  })
}

const loop = async () => {
  const ip = vpn[rand(vpn.length)]
  console.log('Start: ' + ip, logTime())

  shell.exec('expressvpn disconnect', { silent: true })
  const reconnect = shell.exec('expressvpn connect ' + ip, { silent: true })

  if (/Unable/.test(reconnect.stderr) || /Unable/.test(reconnect.stdout)) {
    console.log('Fail: ' + ip)
    await loop()
  }
}

let time = 0
const addTime = 1000 * 5

const multi = async () => {
  if (over) { return }
  if (time >= 1000 * 60 * 5 + rand(1000 * 60 * 5)) {
    await loop()
    time = 0
  }
  await launch()
  setTimeout(() => {
    multi()
    time += addTime
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
