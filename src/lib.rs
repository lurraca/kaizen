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

    // Extract only the <main>...</main> content to avoid false positives
    // from navigation, footer, scripts, or analytics changes
    let content_to_hash = if let (Some(start), Some(end)) = (body.find("<main>"), body.find("</main>")) {
        &body[start..end + 7] // 7 = "</main>".len()
    } else {
        // Fall back to full body if <main> tags not found
        body.as_str()
    };

    let mut hasher = Sha256::new();
    hasher.update(content_to_hash.as_bytes());
    let content_hash = hex::encode(hasher.finalize());

    // Check for 2026 content in main section only
    let has_2026 = content_to_hash.contains("2026");

    // Get the KV namespace
    let kv = env.kv("PAGE_STATE")?;

    // Get the previous hash
    let previous_hash = kv.get(KV_KEY).text().await?;

    // Check if content changed
    let content_changed = previous_hash.as_ref() != Some(&content_hash);

    // Build notification message based on what we found
    let message = if has_2026 {
        "JLPT 2026 dates may have been announced! Check https://www.ucd.ie/japan/exams/"
    } else if content_changed {
        "UCD JLPT page has been updated. Check https://www.ucd.ie/japan/exams/"
    } else {
        "JLPT check complete - no changes detected."
    };

    console_log!("{}", message);

    // Always send notification
    send_ntfy_notification(env, message).await?;

    // Update stored hash if content changed
    if content_changed {
        kv.put(KV_KEY, &content_hash)?.execute().await?;
    }

    Ok(())
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
