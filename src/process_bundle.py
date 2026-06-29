import sys
import UnityPy
import traceback
import re
from PIL import Image, ImageOps

sys.setrecursionlimit(10000)

def hex_to_rgba(hex_color):
    """Konversi HEX color ke RGBA float (0.0 - 1.0)"""
    hex_color = hex_color.lstrip('#')
    if len(hex_color) == 6:
        r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
        return (r/255.0, g/255.0, b/255.0, 1.0)
    elif len(hex_color) == 8:
        r, g, b, a = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4, 6))
        return (r/255.0, g/255.0, b/255.0, a/255.0)
    return (1.0, 1.0, 1.0, 1.0)

def is_color_black(r, g, b, threshold=0.05):
    """Deteksi apakah warna mendekati hitam pekat"""
    return r <= threshold and g <= threshold and b <= threshold

def replace_all_colors_recursive(node, target_rgba):
    modified = False
    if isinstance(node, dict):
        # Determine if this dict is exactly a ColorRGBA or Color representation
        if "r" in node and "g" in node and "b" in node and len(node) <= 5:
            node["r"] = target_rgba[0]
            node["g"] = target_rgba[1]
            node["b"] = target_rgba[2]
            return True
        for k, v in node.items():
            if replace_all_colors_recursive(v, target_rgba):
                modified = True
    elif isinstance(node, list):
        for item in node:
            if replace_all_colors_recursive(item, target_rgba):
                modified = True
    return modified



def transform_typetree(node, pattern, target_str, is_asset_bundle=False, current_key=None):
    changed = False
    
    if isinstance(node, dict):
        # Use list(node.items()) to avoid RuntimeError if we were to change dict size (though we only update values)
        # We can just iterate node.items() safely if we only update values, but list() is safer.
        for k, v in list(node.items()):
            if k in ["strSpliteNode1", "strSpliteNode2"]:
                continue
                
            new_v, v_changed = transform_typetree(v, pattern, target_str, is_asset_bundle, k)
            if v_changed:
                node[k] = new_v
                changed = True
        return node, changed
        
    elif isinstance(node, list):
        for i, item in enumerate(node):
            new_item, item_changed = transform_typetree(item, pattern, target_str, is_asset_bundle, current_key)
            if item_changed:
                node[i] = new_item
                changed = True
        return node, changed
        
    elif isinstance(node, tuple):
        new_tuple = []
        tuple_changed = False
        for i, item in enumerate(node):
            new_item, item_changed = transform_typetree(item, pattern, target_str, is_asset_bundle, current_key)
            new_tuple.append(new_item)
            if item_changed:
                tuple_changed = True
                
        if tuple_changed:
            return tuple(new_tuple), True
        return node, False
        
    elif isinstance(node, str):
        if is_asset_bundle or current_key == "first":
            target = target_str.lower()
        else:
            target = target_str
        new_node = pattern.sub(lambda m: target, node)
        if new_node != node:
            return new_node, True
        return node, False
        
    else:
        return node, False

def modify_asset_bundle(input_path: str, output_path: str, original_str: str, target_str: str, watermark: str, mode: str = "all", use_compression: bool = True, target_scale: str = ""):
    try:
        # Load the bundle using UnityPy
        env = UnityPy.load(input_path)
        
        # Build case-insensitive regex pattern
        if mode == "modifyEffect":
            pattern = None
        else:
            pattern = re.compile(re.escape(original_str), re.IGNORECASE) if original_str else None
        
        target_rgba = None
        target_is_black = False
        if mode == "modifyEffect" and target_str:
            try:
                target_rgba = hex_to_rgba(target_str)
                target_is_black = is_color_black(target_rgba[0], target_rgba[1], target_rgba[2])
            except Exception:
                pass

        HEAVY_TYPES = ["Texture2D", "Texture3D", "Mesh", "AudioClip", "Shader", "Font", "Sprite", "AnimationClip"]
        
        # Iterate through all objects in the environment
        for obj in env.objects:
            try:
                # If mode is card, skip everything except AssetBundle and GameObject
                if mode == "card" and obj.type.name not in ["AssetBundle", "GameObject"]:
                    continue

                # If mode is all (Ganti Skin), process targeted types to maintain speed but allow effects
                if mode == "all" and obj.type.name not in ["AssetBundle", "GameObject", "MonoBehaviour"]:
                    continue

                if mode == "modifyEffect":
                    # Resize logic
                    if target_scale and obj.type.name == "Transform":
                        try:
                            tree = obj.read_typetree()
                            modified = False
                            if "m_LocalScale" in tree:
                                scale_val = float(target_scale)
                                tree["m_LocalScale"]["x"] = scale_val
                                tree["m_LocalScale"]["y"] = scale_val
                                tree["m_LocalScale"]["z"] = scale_val
                                modified = True
                            if modified:
                                obj.save_typetree(tree)
                        except Exception as e:
                            pass
                    
                    # Color Changer logic
                    if target_rgba:
                        if obj.type.name == "Texture2D":
                            data = obj.read()
                            try:
                                img = data.image.convert("RGBA")
                                r, g, b, a = img.split()
                                gray = Image.merge("RGB", (r, g, b)).convert("L")
                                new_img = Image.merge("LA", (gray, a)).convert("RGBA")
                                data.image = new_img
                                data.save()
                            except Exception as e:
                                pass
                            continue
                            
                        elif obj.type.name in ["ParticleSystem", "MonoBehaviour", "SpriteRenderer", "Image", "Text", "Animator", "Material"]:
                            try:
                                tree = obj.read_typetree()
                                if replace_all_colors_recursive(tree, target_rgba):
                                    obj.save_typetree(tree)
                            except Exception as e:
                                pass

                    # If not AssetBundle (for watermark), we can skip other string replacements
                    if obj.type.name != "AssetBundle":
                        continue

                # 1. Handle heavy binary objects using binary read to prevent typetree corruption
                if obj.type.name in HEAVY_TYPES:
                    if pattern is not None:
                        data = obj.read()
                        changed = False
                        for attr in ['name', 'm_Name', 'm_strName']:
                            if hasattr(data, attr):
                                val = getattr(data, attr)
                                if isinstance(val, str):
                                    new_val = pattern.sub(lambda m: target_str, val)
                                    if new_val != val:
                                        setattr(data, attr, new_val)
                                        changed = True
                        if changed:
                            data.save()
                    continue

                is_asset_bundle = (obj.type.name == "AssetBundle")
                
                # 2. General replacement
                if pattern is not None or is_asset_bundle:
                    try:
                        tree = obj.read_typetree()
                        changed = False
                        
                        # AssetBundle Object Handling (watermark)
                        if is_asset_bundle:
                            if "m_Name" in tree and tree["m_Name"] != watermark:
                                tree["m_Name"] = watermark
                                changed = True
                            if "name" in tree and tree["name"] != watermark:
                                tree["name"] = watermark
                                changed = True
                                
                        if pattern is not None:
                            new_tree, tree_changed = transform_typetree(tree, pattern, target_str, is_asset_bundle)
                            if tree_changed:
                                changed = True
                                tree = new_tree
                                
                        if changed:
                            obj.save_typetree(tree)
                    except Exception as e:
                        # Fallback to binary attribute replacement for objects that might not support typetree properly
                        if pattern is not None:
                            try:
                                data = obj.read()
                                changed = False
                                for attr in ['name', 'm_Name', 'm_strName']:
                                    if hasattr(data, attr):
                                        val = getattr(data, attr)
                                        if isinstance(val, str):
                                            new_val = pattern.sub(lambda m: target_str, val)
                                            if new_val != val:
                                                setattr(data, attr, new_val)
                                                changed = True
                                if changed:
                                    data.save()
                            except Exception as e2:
                                pass
            except Exception as e:
                print(f"Warning: Failed to process object: {e}")
                    
        # 3. Repacking
        try:
            if use_compression:
                out_bytes = env.file.save(packer="lz4")
            else:
                out_bytes = env.file.save(packer="none")
        except Exception as e:
            print(f"Warning: env.file.save(packer='lz4'/'none') failed: {e}")
            out_bytes = env.file.save()
            
        with open(output_path, "wb") as f:
            f.write(out_bytes)
            
    except Exception as e:
        print(f"ERROR: {str(e)}")
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) < 6:
        print("Usage: process_bundle.py <input> <output> <original> <target> <watermark>")
        sys.exit(1)
        
    input_file = sys.argv[1]
    output_file = sys.argv[2]
    original = sys.argv[3]
    target = sys.argv[4]
    watermark = sys.argv[5]
    mode = sys.argv[6] if len(sys.argv) > 6 else "all"
    use_compression = True
    if len(sys.argv) > 7:
        use_compression = sys.argv[7] == "1"
    
    target_scale = sys.argv[8] if len(sys.argv) > 8 else ""
    
    if mode == "rename":
        import shutil
        shutil.copy2(input_file, output_file)
        print("SUCCESS")
        sys.exit(0)
    
    modify_asset_bundle(input_file, output_file, original, target, watermark, mode, use_compression, target_scale)
    print("SUCCESS")
