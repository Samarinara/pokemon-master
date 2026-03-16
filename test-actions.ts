import { createOrJoinSession, acceptJoiner, disconnectFromSession, getSessionState } from "./lib/matchmaking/actions"
import { getDb } from "./lib/store"

async function run() {
  const code = "TEST" + Math.floor(Math.random() * 1000)
  
  // 1. Host creates
  const res1 = await createOrJoinSession("Host", code)
  if (res1.status !== "created") throw new Error()
  const hostToken = res1.token

  // 2. Joiner joins
  const res2 = await createOrJoinSession("Joiner", code)
  if (res2.status !== "waiting") throw new Error()
  const joinerToken = res2.token
  
  console.log("Simulating host abort")
  disconnectFromSession(code, hostToken) // don't await
  
  await new Promise(r => setTimeout(r, 500))
  
  // 4. Simulate host clicking Accept immediately after
  console.log("Simulating host Accept")
  const res3 = await acceptJoiner(code, hostToken)
  console.log("acceptJoiner result:", res3)
  
  // Check DB
  const state = await getSessionState(code, hostToken)
  console.log("Final state in DB:", state)
}

run().catch(console.error)
