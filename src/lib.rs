use sha2::{Sha256, Digest};
use worker::*;

const UCD_URL: &str = "https://www.ucd.ie/japan/exams/";
const KV_KEY: &str = "page_content_hash";

/// Entry point for scheduled (cron) events
#[event(scheduled)]
async fn scheduled(_event: ScheduledEvent, env: Env, _ctx: ScheduleContext) {
    console_log!("JLPT checker running...");

    if let Err(e) = check_jlpt_page(&env).await {
        console_error!("Error checking JLPT page: {:?}", e);
        let _ = send_ntfy_notification(&env, &format!("JLPT checker error: {}", e)).await;
    }
}

async fn check_jlpt_page(env: &Env) -> Result<()> {
    // Fetch the UCD JLPT page with a browser User-Agent
    // (CloudFront blocks requests without one)
    let headers = Headers::new();
    headers.set("User-Agent", "Mozilla/5.0 (compatible; JLPT-Checker/1.0)")?;

    let mut init = RequestInit::new();
    init.with_headers(headers);

    let request = Request::new_with_init(UCD_URL, &init)?;
    let mut response = Fetch::Request(request).send().await?;

    let status = response.status_code();
    if status != 200 {
        console_error!("Fetch returned HTTP {}", status);
        return Err(Error::RustError(format!("HTTP {} from UCD page", status)));
    }

    let body = response.text().await?;

    // Strip <script>, <style>, and <noscript> blocks to avoid false positives
    // from analytics, GTM, tracking pixels, or injected CSS that vary between requests.
    // The UCD page has no <main> tag, so we strip dynamic elements instead.
    let content_to_hash = strip_dynamic_elements(&body);

    let mut hasher = Sha256::new();
    hasher.update(content_to_hash.as_bytes());
    let content_hash = hex::encode(hasher.finalize());
    console_log!("Content length: {}, hash: {}", content_to_hash.len(), content_hash);

    // Check for 2026 content in main section only
    let has_2026 = content_to_hash.contains("2026");

    // Get the KV namespace
    let kv = env.kv("PAGE_STATE")?;

    // Get the previous hash
    let previous_hash = kv.get(KV_KEY).text().await?;

    // Check if content changed
    let content_changed = previous_hash.as_ref() != Some(&content_hash);

    // Detailed logging for debugging false positives
    if content_changed {
        if let Some(ref prev_hash) = previous_hash {
            console_log!("HASH_CHANGED: {} -> {}", prev_hash, content_hash);
            // Store both hashes in KV for debugging
            let _ = kv.put("previous_hash_debug", prev_hash)?.execute().await;
            let _ = kv.put("current_hash_debug", &content_hash)?.execute().await;
            let _ = kv.put("last_change_timestamp", &Date::now().to_string())?.execute().await;
        } else {
            console_log!("HASH_CHANGED: (no previous) -> {}", content_hash);
        }
    } else {
        console_log!("HASH_UNCHANGED: {}", content_hash);
    }

    // Build notification message based on what we found
    let message = if has_2026 {
        "JLPT 2026 dates may have been announced! Check https://www.ucd.ie/japan/exams/"
    } else if content_changed {
        "UCD JLPT page has been updated. Check https://www.ucd.ie/japan/exams/"
    } else {
        "JLPT check complete - no changes detected."
    };

    console_log!("{}", message);

    send_ntfy_notification(env, message).await?;

    // Update stored hash if content changed
    if content_changed {
        kv.put(KV_KEY, &content_hash)?.execute().await?;
    }

    Ok(())
}

/// Remove `<script>`, `<style>`, and `<noscript>` blocks (and HTML comments)
/// so the hash only covers visible page content.
fn strip_dynamic_elements(html: &str) -> String {
    let mut result = String::with_capacity(html.len());
    let mut remaining = html;

    while !remaining.is_empty() {
        // Find the next tag to strip
        let next_strip = [
            ("<!--", "-->"),
            ("<script", "</script>"),
            ("<style", "</style>"),
            ("<noscript", "</noscript>"),
            ("<footer", "</footer>"),
        ]
        .iter()
        .filter_map(|(open, close)| {
            remaining
                .to_ascii_lowercase()
                .find(open)
                .map(|pos| (pos, *open, *close))
        })
        .min_by_key(|(pos, _, _)| *pos);

        match next_strip {
            Some((pos, _open, close)) => {
                result.push_str(&remaining[..pos]);
                // Find the closing tag (case-insensitive)
                let after_open = &remaining[pos..];
                if let Some(end) = after_open.to_ascii_lowercase().find(close) {
                    remaining = &after_open[end + close.len()..];
                } else {
                    // No closing tag found — skip the rest
                    break;
                }
            }
            None => {
                result.push_str(remaining);
                break;
            }
        }
    }

    result
}

async fn send_ntfy_notification(env: &Env, message: &str) -> Result<()> {
    // Get ntfy topic from environment variable
    let ntfy_topic = env.var("NTFY_TOPIC")?.to_string();
    let ntfy_url = format!("https://ntfy.sh/{}", ntfy_topic);

    let headers = Headers::new();
    headers.set("Title", "JLPT Update")?;

    let mut init = RequestInit::new();
    init.with_method(Method::Post)
        .with_headers(headers)
        .with_body(Some(message.into()));

    let request = Request::new_with_init(&ntfy_url, &init)?;
    Fetch::Request(request).send().await?;

    console_log!("Notification sent to ntfy.sh/{}", ntfy_topic);
    Ok(())
}
