export default async () => {
  const ua = [
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_10_3) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/42.0.2311.90 Safari/537.36',
    'Mozilla/5.0 (Linux; Android 7.0; Moto G (4) Build/NPJS25.93-14-18) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Mobile Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.113 Safari/537.36',
  ]

  const params = {
    executablePath: '/usr/bin/google-chrome-stable',
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

  // params.executablePath = "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe"

  try {
    browser = await puppeteer.launch(params);
  }
  catch (e) {
    console.log('create ' + e)
    return
  }

  browsers.push(browser)

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
      await browser.close()
      browsers.pop()
    }
    catch (e) {
      browsers.pop()
      console.log('Can\'t close')
    }
  }
}