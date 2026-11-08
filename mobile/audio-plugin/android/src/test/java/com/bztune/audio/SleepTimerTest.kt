package com.bztune.audio
import org.junit.Test
import org.junit.Assert.*
class SleepTimerTest{
 @Test fun expiresOnceAndCancels(){var clock=10L;var calls=0;val t=SleepTimer({clock}){calls++};t.configure(15,null);clock+=899999;t.tick();assertEquals(0,calls);clock++;t.tick();t.tick();assertEquals(1,calls);t.configure(30,null);t.cancel();clock+=2000000;t.tick();assertEquals(1,calls)}
 @Test fun endRepeatAndManualSkip(){var calls=0;val t=SleepTimer({0}){calls++};t.configure(0,"entry");t.transition(false);t.ended();assertEquals(0,calls);t.configure(0,"entry");t.transition(true);t.ended();assertEquals(1,calls);assertThrows(IllegalArgumentException::class.java){t.configure(181,null)}}
}
