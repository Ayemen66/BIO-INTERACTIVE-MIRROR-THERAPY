import os
import numpy as np
import scipy.io
from scipy.stats import skew, kurtosis

from sklearn.preprocessing import StandardScaler
from sklearn.decomposition import PCA
from sklearn.model_selection import GridSearchCV, KFold
from sklearn.metrics import accuracy_score, confusion_matrix, classification_report

from sklearn.svm import SVC

import seaborn as sns
import matplotlib.pyplot as plt

DATA_PATH = r"E:\FYP\FYP"

TRAIN_SUBJECTS=["DB2_s1","DB2_s2"]
TEST_SUBJECTS=["DB2_s3"]

# ----------------
# Feature functions
# ----------------

def rms(x): return np.sqrt(np.mean(x**2))
def mav(x): return np.mean(np.abs(x))
def wl(x): return np.sum(np.abs(np.diff(x)))
def zc(x): return np.sum(np.diff(np.sign(x)) != 0)

def extract_features(signal):

    return [

    np.mean(signal),
    np.std(signal),
    rms(signal),
    np.var(signal),
    mav(signal),
    wl(signal),
    zc(signal),
    skew(signal),
    kurtosis(signal),
    np.max(signal),
    np.min(signal),
    np.percentile(signal,25),
    np.percentile(signal,50),
    np.percentile(signal,75)

    ]

# ----------------
# Dataset loading
# ----------------

X_train=[]
y_train=[]
X_test=[]
y_test=[]

for subject in os.listdir(DATA_PATH):

    subject_path=os.path.join(DATA_PATH,subject)

    if subject not in TRAIN_SUBJECTS and subject not in TEST_SUBJECTS:
        continue

    for file in os.listdir(subject_path):

        if not file.endswith(".mat"):
            continue

        mat=scipy.io.loadmat(os.path.join(subject_path,file))

        emg=mat["emg"]
        labels=mat["restimulus"].flatten()

        window=300
        step=150

        for i in range(0,len(emg)-window,step):

            segment=emg[i:i+window]
            label=labels[i]

            if label==0:
                continue

            segment=segment[:,:8]

            features=[]

            for ch in range(segment.shape[1]):

                features.extend(extract_features(segment[:,ch]))

            if subject in TRAIN_SUBJECTS:

                X_train.append(features)
                y_train.append(label)

            else:

                X_test.append(features)
                y_test.append(label)

X_train=np.array(X_train)
X_test=np.array(X_test)
y_train=np.array(y_train)
y_test=np.array(y_test)

# ----------------
# Scaling
# ----------------

scaler=StandardScaler()

X_train=scaler.fit_transform(X_train)
X_test=scaler.transform(X_test)

# ----------------
# PCA
# ----------------

pca=PCA(n_components=0.95)

X_train=pca.fit_transform(X_train)
X_test=pca.transform(X_test)

# ----------------
# Hyperparameter tuning
# ----------------

params={

"C":[0.1,1,10],
"kernel":["linear","rbf"],
"gamma":["scale","auto"]

}

grid=GridSearchCV(

SVC(),
params,
cv=5,
n_jobs=-1,
verbose=2

)

grid.fit(X_train,y_train)

model=grid.best_estimator_

print("Best parameters:",grid.best_params_)

# ----------------
# Testing
# ----------------

pred=model.predict(X_test)

print("Accuracy:",accuracy_score(y_test,pred))

print(classification_report(y_test,pred))

cm=confusion_matrix(y_test,pred)

sns.heatmap(cm,annot=True)
plt.title("SVM Confusion Matrix")
plt.show()
