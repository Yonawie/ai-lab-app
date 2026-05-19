use reqwest::Client;
use serde_json::json;

pub async fn generate_with_ollama(
    model_name: &str,
    system_prompt: String,
    user_prompt: String,
) -> Result<String, String> {
    let client = Client::new();

    let full_prompt = format!(
        "SYSTEM:\n{}\n\nUSER:\n{}\n\nASSISTANT:",
        system_prompt, user_prompt
    );

    let body = json!({
        "model": model_name,
        "prompt": full_prompt,
        "stream": false
    });

    let res = client
        .post("http://localhost:11434/api/generate")
        .json(&body)
        .send()
        .await
        .map_err(|e| e.to_string())?;

    let json: serde_json::Value = res.json().await.map_err(|e| e.to_string())?;

    if let Some(response) = json.get("response").and_then(|r| r.as_str()) {
        Ok(response.to_string())
    } else {
        Err("No response from Ollama".to_string())
    }
}
