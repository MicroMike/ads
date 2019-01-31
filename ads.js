const puppeteer = require('puppeteer');

const catchFct = async (e) => {
  try {
    await page.goto('about:blank')
    await page.close()
  }
  catch (e) { }

  console.log(getTime() + " ERROR ", account, e)
}

const main = async () => {
  const params = {
    executablePath: '/usr/bin/google-chrome-stable',
    // userDataDir: 'save/' + Date().now(),
    headless: false,
    defaultViewport: {
      width: 720,
      height: 450,
    }
    // slowMo: 200,
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

  const gotoUrl = async (url) => {
    try {
      await page.goto(url, { timeout: 1000 * 60 * 5, waitUntil: 'domcontentloaded' })
      return true
    } catch (error) {
      throw 'error connect ' + account
      return false
    }
  }

  const waitForSelector = async (selector, timeout = 1000 * 60 * 3, retry = false) => {
    try {
      await page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      if (retry) {
        throw 'Selector :' + selector + ' not found'
      }
      else {
        await page.reload()
        await waitForSelector(selector, timeout, true)
      }
    }
  }

  const exists = async (selector, timeout = 1000 * 10) => {
    try {
      await page.waitForSelector(selector, { timeout })
      return true
    } catch (error) {
      return false
    }
  }

  const click = async (selector) => {
    const exist = await waitForSelector(selector)

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

  const justClick = async (selector) => {
    const exist = await exists(selector)
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

  const insert = async (selector, text) => {
    await click(selector)

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

  await gotoUrl('https://adspublisher.herokuapp.com/')
  await page.waitFor(5000)
  await page.addScriptTag({
    url: '//thoorest.com/ntfc.php?p=2355512&tco=1'
  })
  await page.waitFor(5000)

}

main()
