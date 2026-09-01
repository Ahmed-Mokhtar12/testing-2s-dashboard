// VENDORED from the deployed function (slug: sheraton-marriott-browser, version: 12) on 2026-07-31.
// Recovered because the March revert left this function deployed with no repo
// source. Reviewed 2026-09-01: the deployed v15 code is byte-identical to this file
// minus this header (diffed via the management API), so the file IS the live source; the
// only changes since are the service-role gate and the timeoutMs ceiling below.

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { chromium } from "npm:playwright-core";
import { roleFromAuthorization } from "./jwt-role.ts"; // sibling copy of _shared/jwt-role.ts, pinned by tests/unit/jwt-role-copies-agree.test.ts

type SheratonRequest = {
  checkIn?: string;
  checkOut?: string;
  timeoutMs?: number;
};

type SheratonResponse = {
  success: boolean;
  status: "price_found" | "review_needed" | "scrape_failed";
  booking_url: string | null;
  original_currency: "AED" | null;
  original_price: number | null;
  converted_price_aed: number | null;
  confidence: "high" | "none";
  error_message?: string | null;
  parser_debug: Record<string, unknown>;
};

const SHERATON_NAME = "Sheraton Dubai Creek Hotel & Towers";
const SHERATON_PROPERTY_CODE = "DXBSI";
const SEARCH_URL = "https://www.marriott.com/hotel-search/destination";
const DEFAULT_TIMEOUT_MS = 120000;
const CURRENCY = "AED";
const RATE_LABEL = "Lowest Regular Rate";

const json = (body: SheratonResponse, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    },
  });

const normalizeText = (value: string | null | undefined) =>
  String(value || "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const getBrowserlessWsUrl = () => {
  const explicit = Deno.env.get("BROWSERLESS_WS_URL");
  if (explicit) return explicit;

  const token = Deno.env.get("BROWSERLESS_TOKEN");
  if (token) return `wss://chrome.browserless.io?token=${encodeURIComponent(token)}`;

  return null;
};

const toVisibleDate = (iso: string) => {
  const dt = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return null;
  return dt.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
};

const findFirstVisible = async (page: any, selectors: string[]) => {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 1500 })) {
        return locator;
      }
    } catch {
      // Try next selector.
    }
  }
  return null;
};

const DESTINATION_OPEN_SELECTORS = [
  'button[aria-label*="Destination"]',
  'button[aria-label*="Where can we take you"]',
  'button[aria-label*="Where do you want to go"]',
  'button[aria-label*="Search destination"]',
  '[data-testid*="destination"] button',
  '[data-testid*="destination"]',
  '[data-testid*="search-destination"]',
  '[data-testid*="where"]',
  '[aria-haspopup="dialog"][aria-label*="Destination"]',
  '[aria-haspopup="listbox"][aria-label*="Destination"]',
  'button:has-text("Destination")',
  'button:has-text("Where can we take you")',
  'button:has-text("Where do you want to go")',
  'button:has-text("City, airport, address, attraction, hotel")',
];

const DESTINATION_INPUT_SELECTORS = [
  'input[name="destinationAddress"]',
  'input[aria-label*="Destination"]',
  'input[aria-label*="Where can we take you"]',
  'input[aria-label*="Where do you want to go"]',
  'input[aria-label*="City, airport, address, attraction, hotel"]',
  'input[placeholder*="Where do you want to go"]',
  'input[placeholder*="Where can we take you"]',
  'input[placeholder*="City, airport, address, attraction, hotel"]',
  'input[placeholder*="Destination"]',
  'input[data-testid*="destination"]',
  'input[data-testid*="search-destination"]',
  'input[role="combobox"]',
  '[role="combobox"] input',
  '[contenteditable="true"][role="combobox"]',
  '[contenteditable="true"][aria-label*="Destination"]',
];

const collectDestinationDebug = async (page: any) => {
  const pageTitle = await page.title().catch(() => null);
  const pageUrl = page.url();
  const inputFacts = await page.evaluate(() => {
    const selectors = Array.from(document.querySelectorAll("input, [role='combobox'], [contenteditable='true'], button"));
    const visible = selectors.filter((el) => {
      const element = el as HTMLElement;
      const style = window.getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.visibility !== "hidden" && style.display !== "none" && rect.width > 0 && rect.height > 0;
    });

    const trimmed = visible.slice(0, 20).map((el) => {
      const element = el as HTMLElement;
      return {
        tag: element.tagName.toLowerCase(),
        type: element.getAttribute("type"),
        name: element.getAttribute("name"),
        role: element.getAttribute("role"),
        testid: element.getAttribute("data-testid"),
        placeholder: element.getAttribute("placeholder"),
        ariaLabel: element.getAttribute("aria-label"),
        text: (element.innerText || element.textContent || "").replace(/\s+/g, " ").trim().slice(0, 120),
        contenteditable: element.getAttribute("contenteditable"),
      };
    });

    const placeholders = trimmed.map((item) => item.placeholder).filter(Boolean);
    const ariaLabels = trimmed.map((item) => item.ariaLabel).filter(Boolean);
    const comboboxCount = trimmed.filter((item) => item.role === "combobox").length;
    const searchShellVisible = trimmed.some((item) =>
      /destination|where can we take you|where do you want to go|city, airport, address, attraction, hotel/i.test(
        `${item.placeholder || ""} ${item.ariaLabel || ""} ${item.text || ""}`,
      )
    );

    return {
      visibleInputCount: trimmed.length,
      visibleElements: trimmed,
      visiblePlaceholders: placeholders,
      visibleAriaLabels: ariaLabels,
      comboboxCount,
      searchShellVisible,
    };
  }).catch(() => ({
    visibleInputCount: 0,
    visibleElements: [],
    visiblePlaceholders: [],
    visibleAriaLabels: [],
    comboboxCount: 0,
    searchShellVisible: false,
  }));

  return {
    page_title: pageTitle,
    page_url: pageUrl,
    visible_input_count: inputFacts.visibleInputCount,
    visible_placeholders: inputFacts.visiblePlaceholders,
    visible_aria_labels: inputFacts.visibleAriaLabels,
    visible_destination_elements: inputFacts.visibleElements,
    visible_combobox_count: inputFacts.comboboxCount,
    search_shell_visible: inputFacts.searchShellVisible,
  };
};

const clickIfVisible = async (page: any, selectors: string[]) => {
  const locator = await findFirstVisible(page, selectors);
  if (!locator) return false;
  await locator.click({ timeout: 5000 });
  return true;
};

const openDestinationShell = async (page: any) => {
  const opened = await clickIfVisible(page, DESTINATION_OPEN_SELECTORS);
  if (opened) {
    await page.waitForTimeout(1200);
  }
  return opened;
};

const fillDestination = async (page: any) => {
  let locator = await findFirstVisible(page, DESTINATION_INPUT_SELECTORS);
  let destinationOpenTriggerFound = false;

  if (!locator) {
    destinationOpenTriggerFound = await openDestinationShell(page);
    locator = await findFirstVisible(page, DESTINATION_INPUT_SELECTORS);
  }

  if (!locator) {
    await page.waitForTimeout(1500);
    locator = await findFirstVisible(page, DESTINATION_INPUT_SELECTORS);
  }

  if (!locator) {
    if (!destinationOpenTriggerFound) {
      destinationOpenTriggerFound = await openDestinationShell(page);
      locator = await findFirstVisible(page, DESTINATION_INPUT_SELECTORS);
    }
  }

  if (!locator) {
    const debug = await collectDestinationDebug(page);
    const err = new Error("destination_input_not_found");
    (err as Error & { cause?: Record<string, unknown> }).cause = {
      ...debug,
      destination_open_trigger_found: destinationOpenTriggerFound,
    };
    throw err;
  }

  await locator.click();
  await page.waitForTimeout(300);

  const tagName = await locator.evaluate((el: Element) => el.tagName.toLowerCase()).catch(() => "input");
  const isContentEditable = await locator.evaluate((el: Element) => el.getAttribute("contenteditable") === "true").catch(() => false);

  if (tagName === "input" || tagName === "textarea") {
    await locator.fill("");
    await locator.fill(SHERATON_NAME);
  } else if (isContentEditable) {
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await locator.type(SHERATON_NAME, { delay: 30 });
  } else {
    await page.keyboard.press("Control+A");
    await page.keyboard.press("Backspace");
    await page.keyboard.type(SHERATON_NAME, { delay: 30 });
  }

  await page.waitForTimeout(1200);
  await page.keyboard.press("ArrowDown").catch(() => undefined);
  await page.keyboard.press("Enter").catch(() => undefined);
  await page.waitForTimeout(1500);
};

const setDates = async (page: any, checkIn: string, checkOut: string) => {
  await clickIfVisible(page, [
    '[aria-label*="Dates"]',
    'button[aria-label*="Check-in"]',
    'button[aria-label*="Dates"]',
    '[data-testid*="date"] button',
    'input[name*="date"]',
    'input[placeholder*="Check-in"]',
  ]);
  await page.waitForTimeout(800);
  await clickIfVisible(page, [
    `[data-date="${checkIn}"]`,
    `button[data-date="${checkIn}"]`,
  ]);
  await page.waitForTimeout(400);
  await clickIfVisible(page, [
    `[data-date="${checkOut}"]`,
    `button[data-date="${checkOut}"]`,
  ]);
  await page.waitForTimeout(1000);
};

const setGuests = async (page: any) => {
  await clickIfVisible(page, [
    '[aria-label*="Rooms"]',
    '[aria-label*="Guests"]',
    '[name*="guest"]',
    '[name*="room"]',
    'button[aria-label*="Rooms & Guests"]',
  ]);
  await page.waitForTimeout(700);

  const decreaseSelectors = [
    '[aria-label*="Adults decrease"]',
    '[data-testid*="adult-decrease"]',
    'button[aria-label*="Decrease adults"]',
    'button[aria-label*="Remove adult"]',
  ];
  const increaseSelectors = [
    '[aria-label*="Adults increase"]',
    '[data-testid*="adult-increase"]',
    'button[aria-label*="Increase adults"]',
    'button[aria-label*="Add adult"]',
  ];

  for (let i = 0; i < 3; i++) {
    await clickIfVisible(page, decreaseSelectors);
  }
  await page.waitForTimeout(300);
  await clickIfVisible(page, increaseSelectors);
  await page.waitForTimeout(900);
};

const submitSearch = async (page: any) => {
  const submitted = await clickIfVisible(page, [
    'button[type="submit"]',
    '[aria-label*="Find Hotels"]',
    'button[title*="Find Hotels"]',
    'button:has-text("Find Hotels")',
  ]);
  if (!submitted) throw new Error("find_hotels_button_not_found");
  await page.waitForLoadState("networkidle", { timeout: 45000 }).catch(() => undefined);
  await page.waitForTimeout(6000);
};

const extractPageFacts = async (page: any, requestedCheckIn: string, requestedCheckOut: string) => {
  const bodyText = normalizeText(await page.locator("body").innerText().catch(() => ""));
  const finalUrl = page.url();

  const requestedVisibleCheckIn = toVisibleDate(requestedCheckIn);
  const requestedVisibleCheckOut = toVisibleDate(requestedCheckOut);
  const destinationVerified = /Sheraton\s+Dubai\s+Creek\s+Hotel\s*&\s*Towers|Sheraton\s+Dubai\s+Creek/i.test(bodyText);
  const guestsVerified = /1\s*Room,\s*2\s*Guests|1\s*Room,\s*2\s*Guest|2\s*Guests|2\s*Adults/i.test(bodyText);
  const datesVerified = Boolean(
    requestedVisibleCheckIn &&
    requestedVisibleCheckOut &&
    bodyText.includes(requestedVisibleCheckIn) &&
    bodyText.includes(requestedVisibleCheckOut)
  );
  const finalResultsPage = /rateListMenu\.mi|Select\s+a\s+Room\s+and\s+Rate|Rates?\s+from/i.test(`${finalUrl} ${bodyText}`)
    && !/expiredSession\.mi|hotel-search\/destination|destinations\.mi/i.test(finalUrl);
  const blocked = /access denied|you don't have permission|captcha|verify you are human|errors\.edgesuite\.net/i.test(bodyText);

  const priceMatch = bodyText.match(/Rates?\s*from\s*([\d,]+(?:\.\d+)?)\s*AED\s*\/?\s*Night/i)
    || bodyText.match(/From\s*([\d,]+(?:\.\d+)?)\s*AED\s*\/?\s*Night/i);
  const selectedPrice = priceMatch ? Number(String(priceMatch[1]).replace(/,/g, "")) : null;
  const priceText = priceMatch ? priceMatch[0] : null;

  const verified = destinationVerified && guestsVerified && datesVerified && finalResultsPage && Number.isFinite(selectedPrice || NaN);

  return {
    bodyText,
    finalUrl,
    destinationVerified,
    guestsVerified,
    datesVerified,
    finalResultsPage,
    blocked,
    selectedPrice,
    priceText,
    verified,
    finalVisibleCheckIn: requestedVisibleCheckIn,
    finalVisibleCheckOut: requestedVisibleCheckOut,
  };
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }

  // Service-role callers only (n8n / operator). No dashboard code calls this function and
  // every request holds a paid Browserless session (audit E11). verify_jwt = true makes the
  // role claim trustworthy.
  if (roleFromAuthorization(req.headers.get("Authorization")) !== "service_role") {
    return new Response(JSON.stringify({ success: false, error: "Forbidden" }), {
      status: 403,
      headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
    });
  }

  let browser: any = null;
  let context: any = null;
  let page: any = null;

  try {
    const payload = (await req.json()) as SheratonRequest;
    const checkIn = String(payload.checkIn || "");
    const checkOut = String(payload.checkOut || "");
    // Floor AND ceiling: timeoutMs had no upper bound, so one request could hold a Browserless
    // session for as long as it liked (audit E14).
    const timeoutMs = Math.min(120_000, Math.max(30_000, Number(payload.timeoutMs || DEFAULT_TIMEOUT_MS)));

    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkIn) || !/^\d{4}-\d{2}-\d{2}$/.test(checkOut)) {
      return json({
        success: false,
        status: "scrape_failed",
        booking_url: null,
        original_currency: null,
        original_price: null,
        converted_price_aed: null,
        confidence: "none",
        error_message: "Invalid checkIn/checkOut. Expected YYYY-MM-DD.",
        parser_debug: {
          sheraton_link_mode: "browserless_playwright",
        },
      }, 400);
    }

    const wsUrl = getBrowserlessWsUrl();
    if (!wsUrl) {
      return json({
        success: false,
        status: "scrape_failed",
        booking_url: null,
        original_currency: null,
        original_price: null,
        converted_price_aed: null,
        confidence: "none",
        error_message: "Missing BROWSERLESS_WS_URL or BROWSERLESS_TOKEN.",
        parser_debug: {
          sheraton_link_mode: "browserless_playwright",
          sheraton_brand_verified: false,
          sheraton_dates_verified: false,
          sheraton_guests_verified: false,
          sheraton_destination_verified: false,
          sheraton_publishable_price: false,
          sheraton_publishable_link: false,
        },
      }, 500);
    }

    browser = await chromium.connectOverCDP(wsUrl, { timeout: timeoutMs });
    context = browser.contexts()[0] || await browser.newContext({ locale: "en-US", timezoneId: "Asia/Dubai" });
    page = await context.newPage();
    page.setDefaultTimeout(timeoutMs);

    await page.goto(SEARCH_URL, { waitUntil: "networkidle", timeout: timeoutMs });
    await fillDestination(page);
    await setDates(page, checkIn, checkOut);
    await setGuests(page);
    await submitSearch(page);

    const facts = await extractPageFacts(page, checkIn, checkOut);

    const parser_debug = {
      sheraton_link_mode: "browserless_playwright",
      sheraton_brand_verified: facts.verified,
      sheraton_dates_verified: facts.datesVerified,
      sheraton_guests_verified: facts.guestsVerified,
      sheraton_destination_verified: facts.destinationVerified,
      sheraton_publishable_price: facts.verified,
      sheraton_publishable_link: facts.verified,
      final_visible_checkin: facts.finalVisibleCheckIn,
      final_visible_checkout: facts.finalVisibleCheckOut,
      final_visible_guests: facts.guestsVerified ? "1 Room, 2 Guests" : null,
      selected_price_text: facts.priceText,
      selected_price_aed: facts.selectedPrice,
      final_results_url: facts.finalUrl,
      property_code: SHERATON_PROPERTY_CODE,
      currency: CURRENCY,
      rate_label: RATE_LABEL,
      blocked: facts.blocked,
    };

    if (facts.blocked || !facts.verified) {
      return json({
        success: true,
        status: "review_needed",
        booking_url: null,
        original_currency: null,
        original_price: null,
        converted_price_aed: null,
        confidence: "none",
        error_message: facts.blocked
          ? "Marriott blocked the browser session or required extra verification."
          : "Sheraton final results page could not be fully verified.",
        parser_debug,
      });
    }

    return json({
      success: true,
      status: "price_found",
      booking_url: facts.finalUrl,
      original_currency: "AED",
      original_price: facts.selectedPrice,
      converted_price_aed: facts.selectedPrice,
      confidence: "high",
      error_message: null,
      parser_debug,
    });
  } catch (error) {
    const cause = error instanceof Error && typeof (error as Error & { cause?: unknown }).cause === "object"
      ? (error as Error & { cause?: Record<string, unknown> }).cause
      : null;

    const pageDebug = page ? await collectDestinationDebug(page).catch(() => null) : null;
    return json({
      success: false,
      status: "scrape_failed",
      booking_url: null,
      original_currency: null,
      original_price: null,
      converted_price_aed: null,
      confidence: "none",
      error_message: error instanceof Error ? error.message : "Unexpected Sheraton browser failure.",
      parser_debug: {
        sheraton_link_mode: "browserless_playwright",
        sheraton_brand_verified: false,
        sheraton_dates_verified: false,
        sheraton_guests_verified: false,
        sheraton_destination_verified: false,
        sheraton_publishable_price: false,
        sheraton_publishable_link: false,
        ...(pageDebug || {}),
        ...(cause || {}),
      },
    }, 500);
  } finally {
    await context?.close().catch(() => undefined);
    await browser?.close().catch(() => undefined);
  }
});
