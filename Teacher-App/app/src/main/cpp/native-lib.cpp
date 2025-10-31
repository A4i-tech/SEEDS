#include <jni.h>
#include <string>
extern "C" {
    #include "aes.h"
}

#define JNI_FUNCTION(name) Java_com_example_seeds_utils_NativeEncryptor_##name

extern "C" JNIEXPORT jbyteArray JNICALL
JNI_FUNCTION(encrypt)(JNIEnv *env, jobject, jstring data, jbyteArray key, jbyteArray iv) {
    const char *dataStr = env->GetStringUTFChars(data, nullptr);
    jbyte *keyBytes = env->GetByteArrayElements(key, nullptr);
    jbyte *ivBytes = env->GetByteArrayElements(iv, nullptr);
    jsize dataLen = env->GetStringUTFLength(data);

    struct AES_ctx ctx;
    AES_init_ctx_iv(&ctx, (uint8_t *) keyBytes, (uint8_t *) ivBytes);
    AES_CBC_encrypt_buffer(&ctx, (uint8_t *) dataStr, dataLen);

    jbyteArray encryptedData = env->NewByteArray(dataLen);
    env->SetByteArrayRegion(encryptedData, 0, dataLen, (jbyte *) dataStr);

    env->ReleaseStringUTFChars(data, dataStr);
    env->ReleaseByteArrayElements(key, keyBytes, 0);
    env->ReleaseByteArrayElements(iv, ivBytes, 0);

    return encryptedData;
}

extern "C" JNIEXPORT jstring JNICALL
JNI_FUNCTION(decrypt)(JNIEnv *env, jobject, jbyteArray encryptedData, jbyteArray key, jbyteArray iv) {
    jbyte *encryptedBytes = env->GetByteArrayElements(encryptedData, nullptr);
    jsize encryptedLength = env->GetArrayLength(encryptedData);
    jbyte *keyBytes = env->GetByteArrayElements(key, nullptr);
    jbyte *ivBytes = env->GetByteArrayElements(iv, nullptr);

    struct AES_ctx ctx;
    AES_init_ctx_iv(&ctx, (uint8_t *) keyBytes, (uint8_t *) ivBytes);
    AES_CBC_decrypt_buffer(&ctx, (uint8_t *) encryptedBytes, encryptedLength);

    jstring decryptedString = env->NewStringUTF((const char *) encryptedBytes);

    env->ReleaseByteArrayElements(encryptedData, encryptedBytes, 0);
    env->ReleaseByteArrayElements(key, keyBytes, 0);
    env->ReleaseByteArrayElements(iv, ivBytes, 0);

    return decryptedString;
}