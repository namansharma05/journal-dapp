import fetch from "node-fetch";

async function testInitialize() {
  const url = "http://localhost:3001/initialize-counter";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
    });
    const data = await response.json();
    console.log("Response:", data);
  } catch (error) {
    console.error("Error:", error);
  }
}

testInitialize();
