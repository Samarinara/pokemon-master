const baseUrl = 'http://localhost:3000';

async function delay(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function testFlow() {
  const joinCode = 'TEST99';
  console.log(`Starting test for code: ${joinCode}`);

  // 1. Host creates
  const res1 = await fetch(`${baseUrl}/api/lobby`, { // wait, matchmaking is not an API route! It's Next.js Server Actions! 
  });
}

testFlow();
