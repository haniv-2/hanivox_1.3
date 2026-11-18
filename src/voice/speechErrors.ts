// Turns Android SpeechRecognizer error codes into messages a person can act on.
// -1 and -2 are Hanivox's own codes.

export function speechErrorMessage(code: number): string {
  switch (code) {
    case -1:
      return "This phone can't recognise speech on the device itself. Turn on \"Allow online recognition\" below (audio then goes to Google), or install an offline speech pack in your phone's settings.";
    case -2:
      return 'Speech recognition could not start. Try again.';
    case 1:
    case 2:
    case 4:
    case 11:
      return 'The online speech service could not be reached. Check your internet, or use offline speech.';
    case 3:
      return 'Microphone problem. Close other apps that use the microphone and try again.';
    case 5:
      return 'Speech recognition stopped unexpectedly. Tap the mic and try again.';
    case 6:
      return "I didn't hear anything. Tap the mic and speak right after it starts listening.";
    case 7:
      return "I couldn't understand that. Try again, a little slower.";
    case 8:
      return 'Speech recognition is busy. Try again in a moment.';
    case 9:
      return 'Microphone permission is missing. Allow it in Android Settings → Apps → Hanivox → Permissions.';
    case 10:
      return 'Too many requests. Wait a few seconds and try again.';
    case 12:
    case 13:
      return "This speech language isn't installed on the phone. Download it in your phone's speech settings, or turn on online recognition.";
    default:
      return `Speech recognition error (code ${code}).`;
  }
}
