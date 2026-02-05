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
    }
}

async fn check_jlpt_page(env: &Env) -> Result<()> {
    // Fetch the UCD JLPT page
    let mut response = Fetch::Url(UCD_URL.parse().map_err(|_| Error::RustError("Invalid URL".into()))?)
        .send()
        .await?;

    let body = response.text().await?;

    // Check for 2026 content
    let has_2026 = body.contains("2026");

    // Hash the entire page content
    let mut hasher = Sha256::new();
    hasher.update(body.as_bytes());
    let content_hash = hex::encode(hasher.finalize());

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
