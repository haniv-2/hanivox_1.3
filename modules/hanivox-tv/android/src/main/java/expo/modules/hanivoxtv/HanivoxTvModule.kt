package expo.modules.hanivoxtv

import android.content.Context
import android.content.Intent
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.util.Base64
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.cert.jcajce.JcaX509v3CertificateBuilder
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.json.JSONObject
import org.vosk.Model
import org.vosk.Recognizer
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.math.BigInteger
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.HttpURLConnection
import java.net.Inet4Address
import java.net.InetAddress
import java.net.InetSocketAddress
import java.net.NetworkInterface
import java.net.Socket
import java.net.URL
import java.util.zip.ZipInputStream
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.Principal
import java.security.PrivateKey
import java.security.SecureRandom
import java.security.cert.X509Certificate
import java.security.interfaces.RSAPublicKey
import java.util.ArrayDeque
import java.util.Collections
import java.util.Date
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import javax.net.ssl.SSLContext
import javax.net.ssl.SSLSocket
import javax.net.ssl.SSLSocketFactory
import javax.net.ssl.TrustManager
import javax.net.ssl.X509KeyManager
import javax.net.ssl.X509TrustManager

/**
 * Thin native layer for Hanivox: TLS sockets that present our own client certificate,
 * plus device discovery. All protocol logic lives in TypeScript (src/drivers/androidtv).
 *
 * The TV uses a self-signed certificate on a home network, so server certificates are
 * accepted without a CA check. Traffic never leaves the local network.
 */
class HanivoxTvModule : Module() {
  private val alias = "hanivox"
  private val password = "hanivox".toCharArray()
  private var keyStore: KeyStore? = null

  private val sockets = ConcurrentHashMap<Int, SSLSocket>()
  private val nextId = AtomicInteger(1)

  private var nsd: NsdManager? = null
  private var discoveryListener: NsdManager.DiscoveryListener? = null
  private val resolveQueue = ArrayDeque<NsdServiceInfo>()
  private var resolving = false

  private val mainHandler = Handler(Looper.getMainLooper())
  private var recognizer: SpeechRecognizer? = null

  private var wakeModel: Model? = null
  @Volatile private var wakeRunning = false
  private var wakeThread: Thread? = null

  private val context: Context
    get() = appContext.reactContext
      ?: throw CodedException("NO_CONTEXT", "Android context is not available", null)

  override fun definition() = ModuleDefinition {
    Name("HanivoxTv")

    Events(
      "onDeviceFound", "onTlsData", "onTlsClosed",
      "onSpeechState", "onSpeechPartial", "onSpeechResult", "onSpeechError",
      "onWakeDetected", "onWakeDownload", "onWakeError"
    )

    AsyncFunction("getCertInfo") {
      val cert = ensureKeyStore().getCertificate(alias) as X509Certificate
      val pub = cert.publicKey as RSAPublicKey
      mapOf(
        "modulusHex" to pub.modulus.toString(16),
        "exponentHex" to pub.publicExponent.toString(16)
      )
    }

    AsyncFunction("tlsOpen") { host: String, port: Int ->
      val factory = socketFactory(ensureKeyStore())
      val raw = Socket()
      raw.connect(InetSocketAddress(host, port), 5000)
      val ssl = factory.createSocket(raw, host, port, true) as SSLSocket
      ssl.soTimeout = 8000
      ssl.startHandshake()
      ssl.soTimeout = 0
      val serverCert = ssl.session.peerCertificates[0] as X509Certificate
      val pub = serverCert.publicKey as RSAPublicKey
      val id = nextId.getAndIncrement()
      sockets[id] = ssl
      mapOf(
        "id" to id,
        "serverModulusHex" to pub.modulus.toString(16),
        "serverExponentHex" to pub.publicExponent.toString(16)
      )
    }

    AsyncFunction("tlsListen") { id: Int ->
      val ssl = sockets[id] ?: throw CodedException("NO_SOCKET", "Socket $id is not open", null)
      val thread = Thread {
        val buf = ByteArray(8192)
        try {
          val input = ssl.inputStream
          while (true) {
            val n = input.read(buf)
            if (n < 0) break
            sendEvent(
              "onTlsData",
              mapOf("id" to id, "data" to Base64.encodeToString(buf, 0, n, Base64.NO_WRAP))
            )
          }
        } catch (e: Exception) {
          // connection ended
        }
        sockets.remove(id)
        try { ssl.close() } catch (e: Exception) { }
        sendEvent("onTlsClosed", mapOf("id" to id))
      }
      thread.isDaemon = true
      thread.start()
      Unit
    }

    AsyncFunction("tlsWrite") { id: Int, data: String ->
      val ssl = sockets[id] ?: throw CodedException("NO_SOCKET", "Socket $id is not open", null)
      val bytes = Base64.decode(data, Base64.NO_WRAP)
      synchronized(ssl) {
        ssl.outputStream.write(bytes)
        ssl.outputStream.flush()
      }
      Unit
    }

    AsyncFunction("tlsClose") { id: Int ->
      val ssl = sockets.remove(id)
      if (ssl != null) {
        try { ssl.close() } catch (e: Exception) { }
      }
      Unit
    }

    AsyncFunction("startDiscovery") {
      stopDiscoveryInternal()
      val mgr = context.getSystemService(Context.NSD_SERVICE) as NsdManager
      nsd = mgr
      val listener = object : NsdManager.DiscoveryListener {
        override fun onDiscoveryStarted(serviceType: String) {}
        override fun onServiceFound(serviceInfo: NsdServiceInfo) {
          synchronized(resolveQueue) { resolveQueue.add(serviceInfo) }
          resolveNext()
        }
        override fun onServiceLost(serviceInfo: NsdServiceInfo) {}
        override fun onDiscoveryStopped(serviceType: String) {}
        override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {}
        override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
      }
      discoveryListener = listener
      mgr.discoverServices("_androidtvremote2._tcp", NsdManager.PROTOCOL_DNS_SD, listener)
      Unit
    }

    AsyncFunction("stopDiscovery") {
      stopDiscoveryInternal()
      Unit
    }

    AsyncFunction("scanSubnet") { port: Int ->
      scan(port)
    }


    AsyncFunction("probePort") { host: String, port: Int, timeoutMs: Int ->
      try {
        Socket().use { sock ->
          sock.connect(InetSocketAddress(host, port), timeoutMs)
        }
        true
      } catch (e: Exception) {
        false
      }
    }

    AsyncFunction("sendUdp") { dataBase64: String, host: String, port: Int ->
      val bytes = Base64.decode(dataBase64, Base64.NO_WRAP)
      DatagramSocket().use { sock ->
        sock.broadcast = true
        sock.send(DatagramPacket(bytes, bytes.size, InetAddress.getByName(host), port))
      }
      Unit
    }

    AsyncFunction("wakeModelInstalled") {
      File(wakeDir(), "conf").exists()
    }

    AsyncFunction("wakeDownloadModel") {
      downloadWakeModel()
      Unit
    }

    AsyncFunction("wakeStart") {
      startWakeLoop()
      Unit
    }

    AsyncFunction("wakeStop") {
      stopWakeLoop()
      Unit
    }

    AsyncFunction("speechCapabilities") {
      val ctx = context
      val onDevice = Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)
      mapOf(
        "onDevice" to onDevice,
        "system" to SpeechRecognizer.isRecognitionAvailable(ctx)
      )
    }

    AsyncFunction("startListening") { lang: String, allowOnline: Boolean ->
      mainHandler.post { startRecognizer(lang, allowOnline) }
      Unit
    }

    AsyncFunction("stopListening") {
      mainHandler.post {
        try { recognizer?.stopListening() } catch (e: Exception) { }
      }
      Unit
    }

    AsyncFunction("cancelListening") {
      mainHandler.post { destroyRecognizer() }
      Unit
    }
  }



  // ---- "Hey Vox" wake word: offline Vosk model, microphone open only while enabled ----------

  private fun wakeDir(): File = File(context.filesDir, "vosk-model-small-en-us-0.15")

  private fun downloadWakeModel() {
    val ctx = context
    val zipFile = File(ctx.cacheDir, "vosk-model.zip")
    val conn = URL("https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip").openConnection() as HttpURLConnection
    conn.connectTimeout = 15000
    conn.readTimeout = 30000
    conn.connect()
    if (conn.responseCode != 200) {
      throw CodedException("DOWNLOAD", "Download failed (HTTP " + conn.responseCode + ")", null)
    }
    val total = conn.contentLengthLong
    var done = 0L
    var lastPct = -1
    conn.inputStream.use { input ->
      FileOutputStream(zipFile).use { out ->
        val buf = ByteArray(32768)
        while (true) {
          val n = input.read(buf)
          if (n < 0) break
          out.write(buf, 0, n)
          done += n
          if (total > 0) {
            val pct = (done * 90 / total).toInt()
            if (pct != lastPct) {
              lastPct = pct
              sendEvent("onWakeDownload", mapOf("percent" to pct))
            }
          }
        }
      }
    }
    val target = ctx.filesDir
    val targetPath = target.canonicalPath + File.separator
    ZipInputStream(FileInputStream(zipFile)).use { zin ->
      var entry = zin.nextEntry
      while (entry != null) {
        val outFile = File(target, entry.name)
        if (!outFile.canonicalPath.startsWith(targetPath)) {
          throw CodedException("ZIP", "Unexpected file in the model download", null)
        }
        if (entry.isDirectory) {
          outFile.mkdirs()
        } else {
          outFile.parentFile?.mkdirs()
          FileOutputStream(outFile).use { zin.copyTo(it) }
        }
        zin.closeEntry()
        entry = zin.nextEntry
      }
    }
    zipFile.delete()
    wakeModel = null
    if (!File(wakeDir(), "conf").exists()) {
      throw CodedException("ZIP", "The model did not unpack correctly", null)
    }
    sendEvent("onWakeDownload", mapOf("percent" to 100))
  }

  private fun isWakePhrase(text: String): Boolean {
    val t = text.trim()
    return t == "hey vox" || t == "hey box" || t == "hey fox" || t == "hey vocs"
  }

  private fun startWakeLoop() {
    if (wakeRunning) return
    val dir = wakeDir()
    if (!File(dir, "conf").exists()) {
      sendEvent("onWakeError", mapOf("message" to "The wake word model is not installed."))
      return
    }
    wakeRunning = true
    val thread = Thread {
      var audio: AudioRecord? = null
      var recognizerRef: Recognizer? = null
      try {
        if (wakeModel == null) wakeModel = Model(dir.absolutePath)
        val rec = Recognizer(wakeModel, 16000.0f, "[\"hey vox\", \"hey box\", \"hey fox\", \"hey vocs\", \"[unk]\"]")
        recognizerRef = rec
        val minBuf = AudioRecord.getMinBufferSize(16000, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
        val ar = AudioRecord(
          MediaRecorder.AudioSource.VOICE_RECOGNITION, 16000,
          AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT,
          Math.max(minBuf * 2, 8192)
        )
        audio = ar
        if (ar.state != AudioRecord.STATE_INITIALIZED) {
          throw IllegalStateException("The microphone could not be opened.")
        }
        ar.startRecording()
        val buf = ShortArray(2048)
        while (wakeRunning) {
          val n = ar.read(buf, 0, buf.size)
          if (n < 0) break
          if (n == 0) continue
          if (rec.acceptWaveForm(buf, n)) {
            val text = JSONObject(rec.result).optString("text", "")
            if (isWakePhrase(text)) {
              wakeRunning = false
              sendEvent("onWakeDetected", mapOf("text" to text))
              break
            }
          }
        }
      } catch (e: Exception) {
        wakeRunning = false
        sendEvent("onWakeError", mapOf("message" to (e.message ?: "Wake word error")))
      } finally {
        try { audio?.stop() } catch (e: Exception) { }
        try { audio?.release() } catch (e: Exception) { }
        try { recognizerRef?.close() } catch (e: Exception) { }
      }
    }
    thread.isDaemon = true
    wakeThread = thread
    thread.start()
  }

  private fun stopWakeLoop() {
    wakeRunning = false
    val t = wakeThread
    if (t != null) {
      try { t.join(2000) } catch (e: Exception) { }
    }
    wakeThread = null
  }

  // ---- speech recognition (always on the main thread) ----------------------------------

  private fun destroyRecognizer() {
    try {
      recognizer?.cancel()
      recognizer?.destroy()
    } catch (e: Exception) { }
    recognizer = null
  }

  private fun startRecognizer(lang: String, allowOnline: Boolean) {
    try {
      val ctx = context
      destroyRecognizer()
      val canOnDevice = Build.VERSION.SDK_INT >= 33 && SpeechRecognizer.isOnDeviceRecognitionAvailable(ctx)
      val rec: SpeechRecognizer
      if (canOnDevice) {
        rec = SpeechRecognizer.createOnDeviceSpeechRecognizer(ctx)
      } else if (allowOnline && SpeechRecognizer.isRecognitionAvailable(ctx)) {
        rec = SpeechRecognizer.createSpeechRecognizer(ctx)
      } else {
        sendEvent("onSpeechError", mapOf("code" to -1))
        return
      }

      rec.setRecognitionListener(object : RecognitionListener {
        override fun onReadyForSpeech(params: Bundle?) {
          sendEvent("onSpeechState", mapOf("state" to "listening"))
        }
        override fun onBeginningOfSpeech() {}
        override fun onRmsChanged(rmsdB: Float) {}
        override fun onBufferReceived(buffer: ByteArray?) {}
        override fun onEndOfSpeech() {
          sendEvent("onSpeechState", mapOf("state" to "processing"))
        }
        override fun onError(error: Int) {
          sendEvent("onSpeechError", mapOf("code" to error))
          destroyRecognizer()
        }
        override fun onResults(results: Bundle?) {
          val list = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: ArrayList<String>()
          sendEvent("onSpeechResult", mapOf("alternatives" to list))
          destroyRecognizer()
        }
        override fun onPartialResults(partialResults: Bundle?) {
          val list = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
          if (list != null && list.isNotEmpty()) {
            sendEvent("onSpeechPartial", mapOf("text" to list[0]))
          }
        }
        override fun onEvent(eventType: Int, params: Bundle?) {}
      })

      val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
      intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
      intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
      intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
      intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 5)
      intent.putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, !allowOnline)
      intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, ctx.packageName)
      recognizer = rec
      rec.startListening(intent)
    } catch (e: Exception) {
      sendEvent("onSpeechError", mapOf("code" to -2))
    }
  }

  // ---- certificates --------------------------------------------------------------------

  @Synchronized
  private fun ensureKeyStore(): KeyStore {
    val existing = keyStore
    if (existing != null) return existing

    val file = File(context.filesDir, "hanivox-client.p12")
    if (file.exists()) {
      try {
        val ks = KeyStore.getInstance("PKCS12")
        FileInputStream(file).use { ks.load(it, password) }
        if (ks.containsAlias(alias)) {
          keyStore = ks
          return ks
        }
      } catch (e: Exception) {
        // fall through and create a new identity
      }
    }

    val kpg = KeyPairGenerator.getInstance("RSA")
    kpg.initialize(2048)
    val kp = kpg.generateKeyPair()
    val name = X500Name("CN=Hanivox")
    val now = System.currentTimeMillis()
    val builder = JcaX509v3CertificateBuilder(
      name,
      BigInteger.valueOf(now),
      Date(now - 24L * 3600L * 1000L),
      Date(now + 20L * 365L * 24L * 3600L * 1000L),
      name,
      kp.public
    )
    val signer = JcaContentSignerBuilder("SHA256withRSA").build(kp.private)
    val cert = JcaX509CertificateConverter().getCertificate(builder.build(signer))

    val fresh = KeyStore.getInstance("PKCS12")
    fresh.load(null, null)
    fresh.setKeyEntry(alias, kp.private, password, arrayOf(cert))
    FileOutputStream(file).use { fresh.store(it, password) }
    keyStore = fresh
    return fresh
  }

  /** Always offers our certificate, whatever CA list the TV sends. */
  private class FixedKeyManager(
    private val key: PrivateKey,
    private val chain: Array<X509Certificate>,
    private val alias: String
  ) : X509KeyManager {
    override fun chooseClientAlias(keyType: Array<String>?, issuers: Array<Principal>?, socket: Socket?): String = alias
    override fun getClientAliases(keyType: String?, issuers: Array<Principal>?): Array<String> = arrayOf(alias)
    override fun getCertificateChain(alias: String?): Array<X509Certificate> = chain
    override fun getPrivateKey(alias: String?): PrivateKey = key
    override fun chooseServerAlias(keyType: String?, issuers: Array<Principal>?, socket: Socket?): String? = null
    override fun getServerAliases(keyType: String?, issuers: Array<Principal>?): Array<String>? = null
  }

  private fun socketFactory(ks: KeyStore): SSLSocketFactory {
    val key = ks.getKey(alias, password) as PrivateKey
    val chain = ks.getCertificateChain(alias).map { it as X509Certificate }.toTypedArray()
    val trustAll = arrayOf<TrustManager>(object : X509TrustManager {
      override fun checkClientTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun checkServerTrusted(chain: Array<X509Certificate>, authType: String) {}
      override fun getAcceptedIssuers(): Array<X509Certificate> = arrayOf()
    })
    val ctx = SSLContext.getInstance("TLS")
    ctx.init(arrayOf(FixedKeyManager(key, chain, alias)), trustAll, SecureRandom())
    return ctx.socketFactory
  }

  // ---- discovery -----------------------------------------------------------------------

  private fun stopDiscoveryInternal() {
    try {
      val l = discoveryListener
      if (l != null) nsd?.stopServiceDiscovery(l)
    } catch (e: Exception) { }
    discoveryListener = null
    synchronized(resolveQueue) {
      resolveQueue.clear()
      resolving = false
    }
  }

  private fun resolveNext() {
    val mgr = nsd ?: return
    val next: NsdServiceInfo? = synchronized(resolveQueue) {
      if (resolving) {
        null
      } else {
        val item = resolveQueue.poll()
        if (item != null) resolving = true
        item
      }
    }
    if (next == null) return

    @Suppress("DEPRECATION")
    mgr.resolveService(next, object : NsdManager.ResolveListener {
      override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) {
        resolveDone()
      }

      override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
        val addr = serviceInfo.host
        if (addr is Inet4Address) {
          sendEvent(
            "onDeviceFound",
            mapOf(
              "name" to serviceInfo.serviceName,
              "host" to (addr.hostAddress ?: ""),
              "port" to serviceInfo.port
            )
          )
        }
        resolveDone()
      }
    })
  }

  private fun resolveDone() {
    synchronized(resolveQueue) { resolving = false }
    resolveNext()
  }

  private fun localPrefix(): String? {
    val ifaces = NetworkInterface.getNetworkInterfaces() ?: return null
    for (nif in ifaces) {
      if (!nif.isUp || nif.isLoopback) continue
      if (!(nif.name.startsWith("wlan") || nif.name.startsWith("eth"))) continue
      for (a in nif.inetAddresses) {
        if (a is Inet4Address && a.isSiteLocalAddress) {
          val parts = (a.hostAddress ?: continue).split(".")
          if (parts.size == 4) return parts[0] + "." + parts[1] + "." + parts[2] + "."
        }
      }
    }
    return null
  }

  private fun scan(port: Int): List<String> {
    val prefix = localPrefix() ?: return emptyList()
    val pool = Executors.newFixedThreadPool(48)
    val found = Collections.synchronizedList(ArrayList<String>())
    for (i in 1..254) {
      val ip = prefix + i
      pool.execute {
        try {
          Socket().use { s ->
            s.connect(InetSocketAddress(ip, port), 600)
            found.add(ip)
          }
        } catch (e: Exception) { }
      }
    }
    pool.shutdown()
    pool.awaitTermination(15, TimeUnit.SECONDS)
    return found.toList()
  }
}
