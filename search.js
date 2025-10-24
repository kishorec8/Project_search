// **THIS LINE IS UPDATED!** We are now using require()
const fetch = require('node-fetch');

// This is the main "handler" function that Netlify will run
exports.handler = async function(event, context) {
  
  // 1. Get the user's query from the frontend
  let userQuery;
  try {
    userQuery = JSON.parse(event.body).userQuery;
    if (!userQuery) {
      throw new Error("No userQuery provided");
    }
  } catch (error) {
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid search query." }),
    };
  }

  // 2. Get the API key SECURELY from environment variables
  // We will set this in the Netlify website UI
  const apiKey = process.env.GEMINI_API_KEY;
  
  if (!apiKey) {
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "Server is missing API key configuration." }),
    };
  }
  
  const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;

  // 3. This is the same AI logic from our prototype
  const systemPrompt = `You are an expert e-commerce search assistant. Your job is to:
1.  **You MUST use the Google Search tool.** Your answer MUST be based *only* on the search results provided.
2.  **Do NOT use your internal knowledge.** If the search results are empty or irrelevant, just say "I could not find any specific products for that query."
3.  Generate a concise, 2-3 sentence conversational recommendation.
4.  Please try to name 2-3 specific product models in your answer (e.g., 'A great option is the Moto G54, or the Samsung F15'), but *only if you find them* in the search results.
5.  If you find them, briefly explain *why* they are good (e.g., 'The Moto has OIS, while the Samsung has a big battery').
6.  Do NOT use any markdown formatting (like '**').
7.  You must respond ONLY with the text of the recommendation. Do not include any other pre-amble or formatting.`;

  const payload = {
    contents: [{ parts: [{ text: `User's e-commerce query: "${userQuery}"` }] }],
    tools: [{ "google_search": {} }],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      maxOutputTokens: 2048,
      temperature: 0.2,
    }
  };

  // 4. Call the Google API (from the server)
  try {
    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!apiResponse.ok) {
       const errorBody = await apiResponse.json();
       console.error("Google API Error:", errorBody);
       return {
         statusCode: apiResponse.status,
         body: JSON.stringify({ message: `API Error: ${errorBody.error.message}` })
       }
    }

    const result = await apiResponse.json();
    const candidate = result.candidates?.[0];

    if (candidate && candidate.finishReason === 'STOP' && candidate.content?.parts?.[0]?.text) {
      const recommendationText = candidate.content.parts[0].text;
      
      let products = [];
      // **THIS LINE IS FIXED!** (Was candidate.groundInfo)
      const metadata = candidate.groundingMetadata; 
      if (metadata && metadata.groundingAttributions) {
        products = metadata.groundingAttributions
          .map(attr => ({
            uri: attr.web?.uri,
            title: attr.web?.title,
          }))
          .filter(p => p.uri && p.title)
          .slice(0, 4);
      }
      
      // 5. Send the final, safe data back to the frontend
      return {
        statusCode: 200,
        body: JSON.stringify({ recommendationText, products })
      };
      
    } else {
       // Handle safety blocks or other issues
       if (candidate && candidate.finishReason === 'SAFETY') {
         return { 
           statusCode: 400, 
           body: JSON.stringify({ message: "The request was blocked for safety reasons. Please adjust your query."}) 
         };
       }
       
       // Handle missing metadata
       if (candidate && candidate.content?.parts?.[0]?.text) {
           const recommendationText = candidate.content.parts[0].text;
           // No products found, but return the text
           return {
                statusCode: 200,
                body: JSON.stringify({ recommendationText, products: [] })
           };
       }
       
       throw new Error("Invalid response from AI service.");
    }

  } catch (error) {
    console.error('Error in server function:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ message: "An error occurred on the server." })
    };
  }
}
