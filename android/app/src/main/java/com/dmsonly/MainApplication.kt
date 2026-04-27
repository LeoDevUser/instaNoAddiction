package com.dmsonly

import android.app.Application
import android.webkit.WebView
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost

// Manually registered packages that autolinking missed due to config cache
import com.transistorsoft.rnbackgroundfetch.RNBackgroundFetchPackage
import io.invertase.notifee.NotifeePackage
import com.reactnativecommunity.cookies.CookieManagerPackage
import com.reactnativecommunity.asyncstorage.AsyncStoragePackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(RNBackgroundFetchPackage())
          add(NotifeePackage())
          add(CookieManagerPackage())
          add(AsyncStoragePackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    WebView.setWebContentsDebuggingEnabled(true)
    loadReactNative(this)
  }
}
