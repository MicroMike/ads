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
  'yohannb'
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

const multi = (index) => {
  const ads = adsArr[index]
  const domain = domains[index]

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
          else {
            logTime()
          }
          await adPage.close()
        }, 1000 * 5);
      }
      catch (e) {
        console.log(e)
        launch(loopcount, loopcount2, true)
      }
    })
  }

  let temp
  for (let i = 0; i < 3; i++) {
    let id = rand(10)
    while (id === temp) { id = rand(10) }
    launch(id, 0)
  }
}

fs.remove('save', async (err) => {
  logTime()
  for (let i = 0; i < 2; i++) {
    multi(i)
  }
})

process.on('SIGINT', function (code) {
  over = true
});
