//! Windows' own input method (IME) while the player types into WestPlay.
//!
//! Windows' Chinese, Japanese and Korean input methods take the keys pressed in the game's window for their own
//! composition before the game's message loop gets them: each reaches it as `VK_PROCESSKEY`, which types nothing
//! (Taiwan's Zhuyin input method, left on Chinese as it usually is, typed nothing into WestPlay at all). WestPlay
//! composes Chinese itself (the cab's Zhuyin keyboard), from the keys as they are. So while the player types
//! (`typing`), the game's window has no input method: it's taken from the window at the first key typed, whatever
//! it had begun composing cancelled, and given back when the typing ends. A key the input method had already taken
//! (that first one) is read back as it was pressed ([`original_key`]).

use std::sync::Mutex;

use windows::Win32::Foundation::HWND;
use windows::Win32::UI::Input::Ime::{
    CPS_CANCEL, HIMC, ImmAssociateContext, ImmGetVirtualKey, ImmNotifyIME, NI_COMPOSITIONSTR,
};
use windows::Win32::UI::Input::KeyboardAndMouse::VK_PROCESSKEY;

/// The input method taken from a window while the player types: the window's handle and the input method's
/// context (as numbers: the handles aren't `Send`), to be given back.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct Taken {
    window: usize,
    context: usize,
}

/// What to do with the input method, for a message of `window` (0: none, a thread's own message).
#[derive(Debug, PartialEq, Eq)]
enum Step {
    Nothing,
    /// Take the window's input method (typing; a key message of a window that still has one).
    Take,
    /// Give the input method back to the window it was taken from (no longer typing).
    GiveBack(Taken),
}

/// The input method taken, if one is (the game's window thread's: the only one that reads its key messages).
#[derive(Debug, Default)]
struct Gate {
    taken: Option<Taken>,
}

impl Gate {
    /// For a message of `window`: while typing, the input method is taken at a key message (the window that
    /// gets keys), and again should the input method have taken a key since (the game gave it back to its
    /// window); once typing ends, it's given back at the next message of that window, on its own thread.
    fn step(&mut self, window: usize, typing: bool, key_message: bool, taken_by_ime: bool) -> Step {
        if window == 0 {
            return Step::Nothing;
        }
        match self.taken {
            None if typing && key_message => Step::Take,
            Some(_) if typing && key_message && taken_by_ime => Step::Take,
            Some(taken) if !typing && taken.window == window => {
                self.taken = None;
                Step::GiveBack(taken)
            }
            _ => Step::Nothing,
        }
    }

    /// The input method was taken from `window`: `context` was its own (0: it had none). Taken again, the first
    /// one is kept, to be given back.
    fn took(&mut self, window: usize, context: usize) {
        if self.taken.is_none_or(|taken| taken.window != window) {
            self.taken = Some(Taken { window, context });
        }
    }
}

static GATE: Mutex<Gate> = Mutex::new(Gate { taken: None });

/// The key a key message of `window` stands for: `key` itself, or, where the input method took it
/// (`VK_PROCESSKEY`), the key that was pressed.
///
/// # Safety
/// On the thread of `window` (its message just taken from its queue, in the game's message loop).
pub unsafe fn original_key(window: HWND, key: u32) -> u32 {
    if key != u32::from(VK_PROCESSKEY.0) || window.is_invalid() {
        return key;
    }
    // SAFETY: the window's own thread (the caller's contract); a plain query of its last key.
    let original = unsafe { ImmGetVirtualKey(window) };
    if original == 0 || original == u32::from(VK_PROCESSKEY.0) { key } else { original }
}

/// For each message the game's window thread takes from its queue (`window`, a key message or not, `key` as the
/// message had it): the input method taken while the player types (`typing`), given back after.
///
/// # Safety
/// On the thread of `window` (the game's message loop, as the message is taken).
pub unsafe fn follow(window: HWND, typing: bool, key_message: bool, key: u32) {
    let taken_by_ime = key == u32::from(VK_PROCESSKEY.0);
    let mut gate = GATE.lock().unwrap_or_else(|e| e.into_inner());
    match gate.step(window.0 as usize, typing, key_message, taken_by_ime) {
        Step::Nothing => {}
        Step::Take => {
            // SAFETY: the window's own thread (the caller's contract): its input method taken from it, and what
            // that had begun composing (the key it took) cancelled.
            let context = unsafe {
                let context = ImmAssociateContext(window, HIMC::default());
                if !context.is_invalid() {
                    let _ = ImmNotifyIME(context, NI_COMPOSITIONSTR, CPS_CANCEL, 0);
                }
                context
            };
            gate.took(window.0 as usize, context.0 as usize);
            crate::log!("typing: the game window's input method put aside while typing");
        }
        Step::GiveBack(taken) => {
            // SAFETY: the window's own thread (a message of it, the caller's contract): its own input method back.
            unsafe {
                ImmAssociateContext(HWND(taken.window as *mut _), HIMC(taken.context as *mut _));
            }
            crate::log!("typing: the game window's input method given back");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn takes_the_input_method_at_the_first_key_typed_and_gives_it_back_after() {
        let mut gate = Gate::default();
        // Not typing, or no key yet: nothing.
        assert_eq!(gate.step(7, false, true, false), Step::Nothing);
        assert_eq!(gate.step(7, true, false, false), Step::Nothing);
        // A thread's own message (no window): nothing.
        assert_eq!(gate.step(0, true, true, true), Step::Nothing);
        // The first key typed: taken.
        assert_eq!(gate.step(7, true, true, true), Step::Take);
        gate.took(7, 42);
        assert_eq!(gate.step(7, true, true, false), Step::Nothing);
        // Typing ends: given back at the window's next message, not another window's.
        assert_eq!(gate.step(9, false, false, false), Step::Nothing);
        assert_eq!(gate.step(7, false, false, false), Step::GiveBack(Taken { window: 7, context: 42 }));
        assert_eq!(gate.step(7, false, true, false), Step::Nothing);
    }

    #[test]
    fn takes_it_again_if_the_game_gave_it_back_keeping_the_first_to_give_back() {
        let mut gate = Gate::default();
        assert_eq!(gate.step(7, true, true, false), Step::Take);
        gate.took(7, 42);
        // The input method took a key again (the game gave its window one): taken again.
        assert_eq!(gate.step(7, true, true, true), Step::Take);
        gate.took(7, 0);
        assert_eq!(gate.step(7, false, false, false), Step::GiveBack(Taken { window: 7, context: 42 }));
    }

    #[test]
    fn leaves_a_key_the_input_method_didnt_take_as_it_is() {
        // SAFETY: no window: returns before asking Windows.
        assert_eq!(unsafe { original_key(HWND::default(), 0x41) }, 0x41);
        assert_eq!(unsafe { original_key(HWND::default(), u32::from(VK_PROCESSKEY.0)) }, u32::from(VK_PROCESSKEY.0));
    }
}
