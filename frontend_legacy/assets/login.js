"use strict";

document.getElementById("loginForm").addEventListener("submit", async event => {
  event.preventDefault();
  const button = document.getElementById("submitBtn");
  const error = document.getElementById("error");
  button.disabled = true;
  error.textContent = "";
  try {
    const session = await IA.api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: document.getElementById("username").value, password: document.getElementById("password").value }) });
    const splitDomain = ["admin.impossiblejerseyapparel.com", "desain.impossiblejerseyapparel.com"].includes(location.hostname.toLowerCase());
    location.href = splitDomain ? "/" : (session.role === "admin" ? "/instruksi" : "/desain");
  } catch (err) {
    error.textContent = err.message;
    button.disabled = false;
  }
});
