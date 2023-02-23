
/** A minimal reference design to demo the logic. */
class SimpleMutex {
  #lock
  async lock() {
    const waitFor = this.#lock
    let ourLockResolve
    const ourLock = new Promise(resolve => ourLockResolve = resolve)
    this.#lock = ourLock
    await waitFor
    return ourLockResolve
  }
}

export class Mutex {
  #lock; #keys = []

  /** Return a promise which will resolve when the current lock (if any) is unlocked. It will then lock the mutex again and the resolved promise will contain a key which can be used to unlock it. If used with a timeout and it timed out then the key will already have unlocked it and the property `key.timedOut` will be set to true. */
  async lock(timeout = false, allowMultipleUnlockCalls = false) {
    const waitFor = this.#lock
    let ourLockResolve
    const ourLock = new Promise(resolve => ourLockResolve = resolve)
    this.#lock = ourLock
    const key = {
      lock: ourLock, // the lock bound to this key
      unlocked: false, // state of lock
      timedOut: false,
      /** Unlock the mutex. */
      unlock: () => {
        if (key.unlocked) {
          if (!allowMultipleUnlockCalls) throw Error('Already unlocked.')
          return
        }
        key.unlocked = true
        this.#keys.shift()
        if (this.#keys.length == 0) { // last lock
          this.#lock = undefined
        }
        ourLockResolve()
      }
    }
    this.#keys.push(key)
    if (timeout) {
      let timeoutPromise, timeoutResolve, timeoutTimer // so we can cancel them
      timeoutPromise = new Promise(resolve => timeoutResolve = resolve)
      timeoutTimer = setTimeout(() => {
        if (!key.unlocked) {
          key.timedOut = true
          key.unlock() // cancel our lock then
          key.unlock = () => {throw Error('Tried to unlock a lock that timed out and is therefore already unlocked. Next time check the key.timedOut property to check if you got a lock or timed out waiting for one.')}
        }
        timeoutResolve(true)
      }, timeout)
      await Promise.race(timeoutPromise, waitFor)
      if (key.timedOut == false) {
        // do not leave anything "hanging"
        clearTimeout(timeoutTimer)
        timeoutResolve()
      }
    } else {
      await waitFor
    }
    return key
  }
  
  /** Returns the key to the current lock or `undefined`. */
  get key() {return this.#keys[0]}

  /** Returns a promise to await unlocking of the current lock. */
  get unlockPromise() {return this.#keys[0]?.lock || Promise.resolve()}

  /** Returns the number of pending unlocks. */
  get locked() {return this.#keys.length}

  /** Returns a promise to await unlocking of all locks. Basically it will resolve at the end of all the queded work protected by locks. */
  get allUnlockedPromise() {
    return new Promise(async resolve => {
      while (this.#lock) {await this.#lock}
      resolve()
    })
  }
}

export class ConcurrencyController {
  #mutex = new Mutex()
  #maxConcurrency
  #runningJobs = 0

  constructor(maxConcurrency) {
    if (typeof maxConcurrency != 'number') throw Error('maxConcurrency must be specified as a number.')
    this.#maxConcurrency = maxConcurrency
  }

  async pushJob(jobFunction) {
    if (this.#runningJobs > this.#maxConcurrency) {
      throw Error('omg')
    } else if (this.#runningJobs == this.#maxConcurrency) {
      await this.#mutex.lock() // unlocked when work available
    }
    this.#runningJobs ++
    await jobFunction()
    this.#runningJobs --
    this.#mutex.key?.unlock() // signal work available to next waiting job
  }
}
