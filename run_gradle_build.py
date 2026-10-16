import os
import subprocess

def run_gradle():
    app_dir = r"e:\FYP\NeuroMirrorApp"
    gradle_bat = r"e:\FYP\gradle_inst\gradle-8.5\bin\gradle.bat"
    java_home = r"C:\Program Files\Android\Android Studio\jbr"
    android_home = r"C:\Users\Ayemen's PC\AppData\Local\Android\Sdk"
    
    env = os.environ.copy()
    env["JAVA_HOME"] = java_home
    env["ANDROID_HOME"] = android_home
    env["PATH"] = os.path.join(java_home, "bin") + os.pathsep + env.get("PATH", "")
    
    cmd = [gradle_bat, "assembleDebug", "--no-daemon", "--stacktrace"]
    print("Executing Gradle assembleDebug live stream...", flush=True)
    p = subprocess.Popen(cmd, cwd=app_dir, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    for line in p.stdout:
        print(line, end="", flush=True)
    p.wait()
    print(f"\nGradle exited with code {p.returncode}", flush=True)

if __name__ == "__main__":
    run_gradle()
