const axios = require('axios');
import { type Page } from 'puppeteer';

const JSON_CONTENT_TYPE = 'application/json';

function getJsonHeaders() {
  return {
    Accept: JSON_CONTENT_TYPE,
    'Content-Type': JSON_CONTENT_TYPE,
  };
}

async function fetchGet(url, extraHeaders) {
  let headers = getJsonHeaders();
  if (extraHeaders) {
    headers = Object.assign(headers, extraHeaders);
  }

  const response = await axios.get(url, { headers });

  if (response.status !== 200) {
    throw new Error(`Sending a request to the institute server returned with status code ${response.status}`);
  }
  return response.data;
}

async function fetchPost(url, data, extraHeaders = {}) {
  const headers = {
    ...getJsonHeaders(),
    ...extraHeaders
  };

  const response = await axios.post(url, data, { headers });

  if (response.status !== 200) {
    throw new Error(`Sending a request to the institute server returned with status code ${response.status}`);
  }
  return response.data;
}

async function fetchGraphql(url, query, variables = {}, extraHeaders = {}) {
  const result = await fetchPost(url, {
    operationName: null,
    query,
    variables
  }, extraHeaders);
  if (result.errors?.length) {
    throw new Error(result.errors[0].message);
  }
  return result.data;
}

// The following functions (fetchGetWithinPage, fetchPostWithinPage) operate within a browser page context
// (e.g., Playwright's page.evaluate). Axios is not directly available in this context unless it's
// specifically injected into the browser page. For now, these functions will continue to use the native `fetch`.
export async function fetchGetWithinPage<TResult>(
  page: Page,
  url: string,
  ignoreErrors = false,
): Promise<TResult | null> {
  const [result, status] = await page.evaluate(async innerUrl => {
    let response: Response | undefined;
    try {
      response = await fetch(innerUrl, { credentials: 'include' });
      if (response.status === 204) {
        return [null, response.status] as const;
      }
      return [await response.text(), response.status] as const;
    } catch (e) {
      throw new Error(
        `fetchGetWithinPage error: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}, url: ${innerUrl}, status: ${response?.status}`,
      );
    }
  }, url);
  if (result !== null) {
    try {
      return JSON.parse(result);
    } catch (e) {
      if (!ignoreErrors) {
        throw new Error(
          `fetchGetWithinPage parse error: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}, url: ${url}, result: ${result}, status: ${status}`,
        );
      }
    }
  }
  return null;
}

export async function fetchPostWithinPage<TResult>(
  page: Page,
  url: string,
  data: Record<string, any>,
  extraHeaders: Record<string, any> = {},
  ignoreErrors = false,
): Promise<TResult | null> {
  const result = await page.evaluate(
    async (innerUrl: string, innerData: Record<string, any>, innerExtraHeaders: Record<string, any>) => {
      const response = await fetch(innerUrl, {
        method: 'POST',
        body: JSON.stringify(innerData),
        credentials: 'include',

        headers: Object.assign(
          { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
          innerExtraHeaders,
        ),
      });
      if (response.status === 204) {
        return null;
      }
      return response.text();
    },
    url,
    data,
    extraHeaders,
  );

  try {
    if (result !== null) {
      return JSON.parse(result);
    }
  } catch (e) {
    if (!ignoreErrors) {
      throw new Error(
        `fetchPostWithinPage parse error: ${e instanceof Error ? `${e.message}\n${e.stack}` : String(e)}, url: ${url}, data: ${JSON.stringify(data)}, extraHeaders: ${JSON.stringify(extraHeaders)}, result: ${result}`,
      );
    }
  }
  return null;
}
