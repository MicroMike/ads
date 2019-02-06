const puppeteer = require('puppeteer');
const fs = require('fs-extra')
var shell = require('shelljs');

process.setMaxListeners(Infinity)

const adsArr = [[
  2356624,
  2356622,
  2356620,
  2356616,
  2356615,
  2355780,
  2355775,
  2355512,
  2354995,
  2353098,
], [
  2371461,
  2371459,
  2371456,
  2371454,
  2371452,
  2371450,
  2371448,
  2371443,
  2371441,
  2371439,
], [
  2373832,
  2373830,
  2373828,
  2373826,
  2373824,
  2373822,
  2373820,
  2373818,
  2373816,
  2373814,
]]
const domains = [
  'adspublisher',
  'reine',
  'yohannb',
]

let over = false
const CRX_PATH = 'C:\\Users\\mike\\workspace\\ads\\ext\\Extensions'

const logTime = () => {
  const date = new Date
  console.log(date.getUTCHours() + 1 + 'H' + date.getUTCMinutes())
}

const rand = (max, min) => {
  return Math.floor(Math.random() * Math.floor(max) + (typeof min !== 'undefined' ? min : 0));
}

const ua = process.env.UA === 'mobile'
  ? 'Mozilla/5.0 (Linux; Android 7.0; Moto G (4) Build/NPJS25.93-14-18) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36'
  : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36'

const newPage = async (userDataDir) => {
  const params = {
    executablePath: '/usr/bin/google-chrome-stable',
    userDataDir,
    headless: false,
    args: [
      //   `--disable-extensions-except=${CRX_PATH}`,
      //   `--load-extension=${CRX_PATH}`,
      '--disable-translate',
      '--window-position=0,0',
      '--window-size=300,300',
      '--user-agent=' + ua,
    ]
  }

  let browser

  try {
    browser = await puppeteer.launch(params);
  }
  catch (e) {
    params.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"
    browser = await puppeteer.launch(params);
  }

  const pages = await browser.pages()
  const page = pages[0]

  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => false,
    });
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
    } catch (error) {
      if (retry) {
        throw 'Selector :' + selector + ' not found'
      }
      else {
        await page.reload()
        await page.wfs(selector, timeout, true)
      }
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

  return page;
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

let count = 9
let vpncount = 0

const multi = (index) => {
  const ads = adsArr[index]
  const domain = domains[index]

  const launch = async (loopcount, loopcount2, retry) => {
    const tmp = 'save/' + 1 + Math.random()
    fs.ensureDir(tmp + '/Default', async (err) => {
      if (err !== null) { console.log(err) }

      await fs.copy('Preferences', tmp + '/Default/Preferences')

      const adPage = await newPage(tmp)

      try {
        await adPage.gotoUrl('https://' + domain + '.herokuapp.com/')
        await adPage.addScriptTag({
          url: urls[loopcount].replace('*', ads[loopcount2])
        })
        await adPage.wfs('iframe')
        const el = await adPage.evaluate(() => {
          const el = document.querySelector('iframe').contentDocument.querySelector('#A button + button')
          document.querySelector('iframe').contentDocument.querySelector('#A button + button') && document.querySelector('iframe').contentDocument.querySelector('#A button + button').onclick()
          return !!el
        })

        if (!el) {
          console.log(loopcount, loopcount2)
          launch(loopcount, loopcount2, true)
          await adPage.close()
          return
        }

        if (retry) {
          console.log(loopcount, loopcount2, 'ok')
        }

        setTimeout(async () => {
          if (loopcount2 + 1 < ads.length) {
            launch(loopcount, loopcount2 + 1)
          }
          else if (++count === 6) {
            loop()
          }
          await adPage.close()
        }, 2600);
      }
      catch (e) {
        console.log(e)
        launch(loopcount, loopcount2, true)
      }
    })
  }

  let temp
  for (let i = 0; i < 2; i++) {
    let id = rand(10)
    while (id === temp) { id = rand(10) }
    launch(id, 0)
  }
}

const loop = async () => {
  const disconnect = shell.exec('expressvpn disconnect &> /dev/null').code
  const reconnect = shell.exec('expressvpn connect ' + vpn[vpncount++] + ' &> /dev/null').code

  if (disconnect || reconnect) {
    loop()
    return
  }

  count = 0
  logTime()

  console.log('Start: ' + vpn[vpncount])
  fs.remove('save', async (err) => {
    for (let i = 0; i < 3; i++) {
      multi(i)
    }
  })
}

loop()

process.on('SIGINT', function (code) {
  over = true
});

process.on('exit', function (code) {
  over = true
  logTime()
});
