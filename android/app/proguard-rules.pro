# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# Add any project specific keep options here:

# @generated begin expo-build-properties - expo prebuild (DO NOT MODIFY)
# Expo modules are found and instantiated reflectively, so R8 cannot see
# that they are used and will rename or remove them.
-keep class * extends expo.modules.kotlin.modules.Module { *; }
-keep class expo.modules.obdbluetooth.** { *; }
-keepclassmembers class * extends expo.modules.kotlin.modules.Module {
  public <init>(...);
}

# @generated end expo-build-properties