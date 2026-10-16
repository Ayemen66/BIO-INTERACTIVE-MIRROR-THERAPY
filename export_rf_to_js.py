import os
import json
import joblib
import numpy as np
import pandas as pd

def serialize_tree(tree, feature_names):
    """
    Serializes a single DecisionTreeClassifier tree structure into a lightweight JSON dict.
    """
    n_nodes = tree.node_count
    children_left = tree.children_left.tolist()
    children_right = tree.children_right.tolist()
    feature = tree.feature.tolist()
    threshold = tree.threshold.tolist()
    values = tree.value[:, 0, :].tolist()
    
    return {
        "node_count": n_nodes,
        "left": children_left,
        "right": children_right,
        "feature": feature,
        "threshold": threshold,
        "value": values
    }

def export_model():
    base_dir = r"e:\FYP\fyp models with codes and data"
    models_dir = os.path.join(base_dir, "outputs", "models")
    tables_dir = os.path.join(base_dir, "outputs", "tables")
    
    gesture_path = os.path.join(models_dir, "random_forest_gesture_model.joblib")
    progress_path = os.path.join(models_dir, "random_forest_progress_model.joblib")
    
    print(f"Loading gesture model from {gesture_path}...")
    gesture_art = joblib.load(gesture_path)
    gesture_model = gesture_art["model"]
    gesture_scaler = gesture_art["scaler"]
    feature_names = gesture_art["selected_features"]
    
    print(f"Loading progress model from {progress_path}...")
    progress_art = joblib.load(progress_path)
    progress_model = progress_art["model"]
    progress_scaler = progress_art["scaler"]
    
    # 1. Serialize Gesture Model Trees
    gesture_trees = [serialize_tree(est.tree_, feature_names) for est in gesture_model.estimators_]
    
    # 2. Serialize Progress Model Trees
    progress_trees = [serialize_tree(est.tree_, feature_names) for est in progress_model.estimators_]
    
    # 3. Scaler Parameters
    scaler_means = gesture_scaler.mean_.tolist()
    scaler_scales = gesture_scaler.scale_.tolist()
    
    # 4. Read RFE Selected Features & Muscle Importance
    importance_csv = os.path.join(tables_dir, "muscle_feature_importance.csv")
    top_30_features = []
    if os.path.exists(importance_csv):
        df_imp = pd.read_csv(importance_csv)
        top_30_features = df_imp["feature"].head(30).tolist()
    else:
        top_30_features = feature_names[:30]
        
    export_payload = {
        "feature_names": feature_names,
        "n_features": len(feature_names),
        "target_muscles": ["FDS", "EDC", "FCR"],
        "scaler": {
            "mean": scaler_means,
            "scale": scaler_scales
        },
        "rfe_selected_features": top_30_features,
        "gesture_model": {
            "n_classes": len(gesture_model.classes_),
            "classes": gesture_model.classes_.tolist(),
            "n_estimators": len(gesture_trees),
            "trees": gesture_trees
        },
        "progress_model": {
            "n_classes": len(progress_model.classes_),
            "classes": progress_model.classes_.tolist(),
            "n_estimators": len(progress_trees),
            "trees": progress_trees
        }
    }
    
    out_js_path = r"e:\FYP\random_forest_model_data.js"
    with open(out_js_path, "w", encoding="utf-8") as f:
        f.write("const RANDOM_FOREST_MODEL_DATA = ")
        json.dump(export_payload, f, indent=2)
        f.write(";\n")
        
    print(f"Successfully exported Random Forest model data to {out_js_path} (Size: {os.path.getsize(out_js_path)/1e6:.2f} MB)")

if __name__ == "__main__":
    export_model()
