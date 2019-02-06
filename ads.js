const puppeteer = require('puppeteer');
const fs = require('fs-extra')

process.setMaxListeners(Infinity)

const sites = [
  986200,
]
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
]]
const domains = [
  'adspublisher',
  'reine',
]
let count = 0
let success = 0
let mainPage
let ads
let domain
let over = false
const CRX_PATH = 'C:\\Users\\mike\\workspace\\ads\\ext\\Extensions'

const logTime = () => {
  const date = new Date
  console.log(date.getUTCHours() + 1 + 'H' + date.getUTCMinutes())
}

const rand = (max, min) => {
  return Math.floor(Math.random() * Math.floor(max) + (typeof min !== 'undefined' ? min : 0));
}

let tempUrl
const url = () => {
  let newUrl = urls[rand(urls.length)]
  while (newUrl === tempUrl) {
    newUrl = urls[rand(urls.length)]
  }
  tempUrl = newUrl
  return newUrl
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
      throw 'error connect ' + account
      return false
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
      console.log('Click error ' + selector, account, 'exist :' + exist)
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
      console.log('Justclick ' + selector, account)
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
      console.log('Insert error ' + selector, account)
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
      console.log('Click error ' + selector, account, 'exist :' + exist)
      return false
    }
  }

  return page;
}

const clickAds = async (links, nb) => {
  const href = links[nb]
  if (href) {
    await mainPage.gotoUrl(href)
  }
  else {
    await mainPage.close()
    return
  }

  await mainPage.waitFor(2000 + rand(2000))
  const url = await mainPage.evaluate(() => {
    return document.querySelector('.input-copy__textarea') && document.querySelector('.input-copy__textarea').innerHTML.split('src="')[1].split('" data')[0]
  })
  console.log(url)
  if (url) {
    const adPage = await newPage()

    adPage.on('close', () => {
      clickAds(links, ++nb)
    })

    try {
      await adPage.gotoUrl('https://adspublisher.herokuapp.com/')
      await adPage.addScriptTag({
        url
      })
      await mainPage.waitFor(2000 + rand(2000))
      await adPage.evaluate(() => {
        document.querySelector('iframe').contentDocument.querySelector('#A button + button') && document.querySelector('iframe').contentDocument.querySelector('#A button + button').onclick()
      })
    }
    catch (e) { }
  }
  else {
    clickAds(links, ++nb)
  }
}

const main = async (siteId) => {
  await mainPage.gotoUrl('https://publishers.propellerads.com/#/pub/sites/site/' + siteId)
  await mainPage.waitFor(2000 + rand(2000))
  await mainPage.select('.site__zones-type select', 'string:pusherpps')
  await mainPage.waitFor(2000 + rand(2000))
  let links = await mainPage.get('.site__zone-tag .site__zone-action')
  clickAds(links, 0)
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

const launch = async (loopcount, loopcount2, retry) => {
  const tmp = 'save/' + 1 + Math.random()
  fs.ensureDir(tmp + '/Default', async (err) => {
    if (err !== null) {
      console.log(err)
    }

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
        await adPage.close()
        launch(loopcount, loopcount2, true)
        return
      }

      if (retry) {
        console.log(loopcount, loopcount2, 'ok')
      }

      success++
setTimeout(async() =>{
if (loopcount2 + 1 < ads.length) {
      launch(loopcount, loopcount2 + 1)
    }
    else if (loopcount + 5 < urls.length) {
      //launch(loopcount + 5, 0)
    }
      await adPage.close()
  }, 1000 * 5);
    }
    catch (e) {
      console.log(e)
      launch(loopcount, loopcount2, true)
    }
  })

  return
  mainPage = await newPage('main')
  await mainPage.gotoUrl('https://publishers.propellerads.com/#/pub/auth')
  const notLog = await mainPage.ext('#username')

  if (notLog) {
    await mainPage.inst('#username', 'assoune.mike@gmail.com')
    await mainPage.inst('#password', '055625f7430@')
    await mainPage.clk('.login__form button')
  }

  main(sites[count])
}

let countMulti = 0

const multi = () => {
  if (countMulti === domains.length) {
    logTime()
    over = true
    return
  }
  console.log('Launch: ' + countMulti)

  ads = adsArr[countMulti]
  domain = domains[countMulti]

  countMulti++

  launch(0, 0)
  launch(1, 0)
  launch(2, 0)
  launch(3, 0)
  launch(4, 0)
  launch(5, 0)
  launch(6, 0)
  launch(7, 0)
  launch(8, 0)
  launch(9, 0)

  const inter = setInterval(() => {
    if (over) { return clearInterval(inter) }
    if (success === 100) {
      success = 0
      clearInterval(inter)
      multi()
    }
  }, 1000 * 10);
}

fs.remove('save', async (err) => {
  logTime()
  multi()
})

process.on('SIGINT', function (code) {
  over = true
});
