//Inspector Editors for the most common Components plus Materials and Scene.
//Editors are not included in LiteScene because they do not depend on them

LS.Components.GlobalInfo["@inspector"] = function( component, inspector )
{
	var node = component._root;
	if(!node)
		return;
	var scene = node._in_tree;
	if(!scene)
		return;

	inspector.addColor("Background", component.background_color, { pretitle: AnimationModule.getKeyframeCode( component, "background_color"), callback: function(color) { vec3.copy(component.background_color,color); } });
	inspector.addColor("Ambient light", component.ambient_color, { pretitle: AnimationModule.getKeyframeCode( component, "ambient_color"), callback: function(color) { vec3.copy(component.ambient_color,color); } });
	inspector.addSeparator();

	inner_setTexture("background");
	inner_setTexture("foreground");
	inner_setTexture("environment");
	inner_setTexture("irradiance");

	inspector.addSeparator();
	//inspector.addCheckbox("Linear Pipeline", component.linear_pipeline, { pretitle: AnimationModule.getKeyframeCode( component, "linear_pipeline"), callback: function(v) { component.linear_pipeline = v; } });

	function inner_setTexture(channel)
	{
		inspector.addTexture(channel, component.textures[channel], { pretitle: AnimationModule.getKeyframeCode( component, "textures/" + channel ), channel: channel, callback: function(filename) { 
			component.textures[this.options.channel] = filename;
			if(filename && filename[0] != ":")
				LS.ResourcesManager.load( filename );
		}});
	}

	inspector.addButton( "Render Settings", "Edit", function(){ EditorModule.showRenderSettingsDialog( component.render_settings ); } );
}

// Some components need special inspectors
LS.Components.Transform["@inspector"] = function(transform, inspector)
{
	if(!transform)
		return;
	var node = transform._root;

	inspector.addVector3("Position", transform._position, { 
		pretitle: AnimationModule.getKeyframeCode( transform, "position"),
		callback: function(r) { 
			if(r.length == 3)
				transform.setPosition(r[0],r[1],r[2]);
		},callback_before: function() {
			UndoModule.saveComponentChangeUndo(transform);
		},callback_update: function() {
			return transform._position;
		},
		precision: 3
	});

	var euler = quat.toEuler( vec3.create(), transform._rotation );
	vec3.scale(euler,euler, RAD2DEG );
	var rot = [euler[2],euler[0],euler[1]];

	inspector.addVector3("Rotation", rot, { 
		pretitle: AnimationModule.getKeyframeCode( transform, "rotation"),
		callback: function(r) {
			vec3.scale(r,r, DEG2RAD );
			var euler = [r[1],r[2],r[0]];
			transform.setRotationFromEuler(euler);
		}, callback_before: function() {
			UndoModule.saveComponentChangeUndo(transform);
	}});

	var scale_widget = inspector.addVector3("Scale", transform._scaling, {
		step: 0.01,
		pretitle: AnimationModule.getKeyframeCode( transform, "scaling"),
		callback: function(v) {
			transform.setScale(v[0],v[1],v[2]);
		},
		callback_before: function() {
			UndoModule.saveComponentChangeUndo(transform);
	}});

	inspector.addNumber("Uniform Scale", transform._scaling[0].toFixed(3), {
		step: 0.01,
		pretitle: AnimationModule.getKeyframeCode( transform, "scaling"),
		callback: function(v) {
			scale_widget.setValue([v,v,v]);
			//transform.setScale(v,v,v);
		}, callback_before: function() {
			UndoModule.saveComponentChangeUndo(transform);
	}});
}


LS.Components.Camera["@inspector"] = function(camera, inspector)
{
	if(!camera) 
		return;
	var node = camera._root;

	inspector.addCombo("Type", camera.type, { values: { "Orthographic" : LS.Camera.ORTHOGRAPHIC, "Perspective": LS.Camera.PERSPECTIVE }, pretitle: AnimationModule.getKeyframeCode( camera, "type"), callback: function (value) { camera.type = value; } });
	inspector.widgets_per_row = 2;
	inspector.addNumber("Fov", camera.fov, { pretitle: AnimationModule.getKeyframeCode( camera, "fov"), min: 2, max: 180, units:'º', callback: function (value) { camera.fov = value; }});
	inspector.addNumber("Aspect", camera.aspect, { pretitle: AnimationModule.getKeyframeCode( camera, "aspect" ), min: 0.1, max: 10, step: 0.01, callback: function (value) { camera.aspect = value; }});
	inspector.addNumber("Near", camera.near, { pretitle: AnimationModule.getKeyframeCode( camera, "near" ), callback: function (value) { camera.near = value; }});
	inspector.addNumber("Far", camera.far, { pretitle: AnimationModule.getKeyframeCode( camera, "far" ), callback: function (value) { camera.far = value; }});
	inspector.widgets_per_row = 1;
	inspector.addNumber("Frustum size", camera.frustum_size, {  pretitle: AnimationModule.getKeyframeCode( camera, "frustum_size" ), callback: function (value) { camera.frustum_size = value; }});
	//inspector.addNumber("Far", camera.far, { callback: function (value) { camera.far = value; }});

	var is_node_camera = (node && !node._is_root);

	if(!is_node_camera)
	{
		inspector.addSeparator();
		inspector.addVector3("Eye", camera.eye, { pretitle: AnimationModule.getKeyframeCode( camera, "eye" ), disabled: is_node_camera, callback: function(v) { 
			camera.eye = v;
		}});
		inspector.addVector3("Center", camera.center, { pretitle: AnimationModule.getKeyframeCode( camera, "center" ), disabled: is_node_camera, callback: function(v) { 
			camera.center = v;
		}});
		inspector.addVector3("Up", camera.up, { pretitle: AnimationModule.getKeyframeCode( camera, "up" ), disabled: is_node_camera, callback: function(v) { 
			camera.up = vec3.normalize(vec3.create(), v);
		}});
	}

	inspector.addButton("","Copy from current",{disabled: is_node_camera, callback: inner_copy_from_current});

	inspector.addTitle("Viewport");
	inspector.addVector2("Offset", camera._viewport.subarray(0,2), { pretitle: AnimationModule.getKeyframeCode( camera, "viewport_offset" ), min:0, max:1, step: 0.001, callback: function(v) { 
		camera._viewport.subarray(0,2).set(v);
	}});
	inspector.addVector2("Size", camera._viewport.subarray(2,4), { pretitle: AnimationModule.getKeyframeCode( camera, "viewport_size" ), min:0, max:1, step: 0.001, callback: function(v) { 
		camera._viewport.subarray(2,4).set(v);
	}});

	inspector.widgets_per_row = 2;
	inspector.addCheckbox("clear color", camera.clear_color , { callback: function (v) { camera.clear_color = v; } });
	inspector.addCheckbox("clear depth", camera.clear_depth , { callback: function (v) { camera.clear_depth = v; } });
	inspector.widgets_per_row = 1;

	inspector.addTitle("Render to Texture");
	inspector.addCheckbox("Enable", camera.render_to_texture , { callback: function (v) { camera.render_to_texture = v; inspector.refresh(); } });
	if(camera.render_to_texture)
	{
		inspector.addString("Name", camera.texture_name, { callback: function (v) { camera.texture_name = v; } });
		inspector.addVector2("Size", camera.texture_size, { callback: function(v) { camera.texture_size.set(v); }});
		inspector.widgets_per_row = 2;
		inspector.addCheckbox("High precission", camera.texture_high, { callback: function(v) { camera.texture_high = v; }});
		inspector.addCheckbox("Clone texture", camera.texture_clone, { callback: function(v) { camera.texture_clone = v; }});
		inspector.widgets_per_row = 1;
	}

	function inner_copy_from_current() {

		//Editor camera is not inside a node, but this camera could be, so be careful
		if(camera._root && camera._root._is_root)
		{
			camera.eye = RenderModule.camera.eye;
			camera.center = RenderModule.camera.center;
			camera.up = RenderModule.camera.up;
			//camera.configure( RenderModule.camera.serialize() );
		}
		else
		{
			//if it is inside the node, then change node position
			var data = RenderModule.camera.serialize();
			data.eye = [0,0,0];
			data.center = [0,0,-1];
			data.up = [0,1,0];
			camera.configure( data );
			camera._root.transform.lookAt( RenderModule.camera.getEye(), RenderModule.camera.getCenter(), RenderModule.camera.getUp(), true );
		}

		inspector.refresh();
	}
}

LS.Components.Light["@inspector"] = function(light, inspector)
{
	if(!light) return;
	var node = light._root;

	var light_types = ["Omni","Spot","Directional"];
	inspector.addCombo("Type", light_types[light.type-1], { pretitle: AnimationModule.getKeyframeCode( light, "type"), values: light_types, callback: function(v) { 
		light.type = light_types.indexOf(v)+1; 
	}});

	inspector.addColor("Color", light.color, { pretitle: AnimationModule.getKeyframeCode( light, "color"), callback: function(color) { light.color = color; } });
	inspector.addSlider("Intensity", light.intensity, { pretitle: AnimationModule.getKeyframeCode( light, "intensity"), min:0, max:2, step:0.01, callback: function (value) { light.intensity = value; }});
	inspector.widgets_per_row = 2;
	inspector.addNumber("Angle", light.angle, { pretitle: AnimationModule.getKeyframeCode( light, "angle"), callback: function (value) { light.angle = value; }});
	inspector.addNumber("Angle End", light.angle_end, { pretitle: AnimationModule.getKeyframeCode( light, "angle_end"), callback: function (value) { light.angle_end = value; }});
	inspector.widgets_per_row = 1;
	inspector.addCheckbox("Spot cone", light.spot_cone != false, { pretitle: AnimationModule.getKeyframeCode( light, "spot_cone"), callback: function(v) { light.spot_cone = v; }});
	inspector.addNumber("Frustum size", light.frustum_size || 100, { pretitle: AnimationModule.getKeyframeCode( light, "frustum_size"), callback: function (value) { light.frustum_size = value; }});

	var is_root_camera = node._is_root;

	if(is_root_camera)
	{
		inspector.addSeparator();

		inspector.addVector3("Position", light.position, { pretitle: AnimationModule.getKeyframeCode( light, "position"), disabled: !is_root_camera, callback: function(v) { 
			light.position = v; 
		}});

		inspector.addVector3("Target", light.target, { pretitle: AnimationModule.getKeyframeCode( light, "target"), disabled: !is_root_camera, callback: function(v) { 
			light.target = v; 
		}});
	}

	inspector.addSeparator();
	inspector.widgets_per_row = 2;
	inspector.addCheckbox("Linear att.", light.linear_attenuation != false, { pretitle: AnimationModule.getKeyframeCode( light, "linear_attenuation"), callback: function(v) { light.linear_attenuation = v; }});
	inspector.addCheckbox("Range att.", light.range_attenuation != false, { pretitle: AnimationModule.getKeyframeCode( light, "range_attenuation"), callback: function(v) { light.range_attenuation = v; }});
	inspector.addNumber("Att. start", light.att_start, { pretitle: AnimationModule.getKeyframeCode( light, "att_start"), callback: function (value) { light.att_start = value;}});
	inspector.addNumber("Att. end", light.att_end, { pretitle: AnimationModule.getKeyframeCode( light, "att_end"), callback: function (value) { light.att_end = value; }});
	inspector.widgets_per_row = 1;
	inspector.addSlider("Phong Offset", light.offset, { pretitle: AnimationModule.getKeyframeCode( light, "offset"), min: 0, step:0.01, max:1, callback: function (value) { light.offset = value; } });
	inspector.addSeparator();
	inspector.widgets_per_row = 2;
	inspector.addCheckbox("Const Diff.", !!light.constant_diffuse, { callback: function(v) { light.constant_diffuse = v; }});
	inspector.addCheckbox("Specular", light.use_specular != false, { callback: function(v) { light.use_specular = v; }});
	inspector.widgets_per_row = 1;
	inspector.addTitle("Shadow");
	inspector.addCheckbox("Cast. shadows", light.cast_shadows, { pretitle: AnimationModule.getKeyframeCode( light, "cast_shadows"), callback: function(v) { light.cast_shadows = v; inspector.refresh(); }});

	if(light.cast_shadows)
	{
		inspector.addCheckbox("Hard shadows", light.hard_shadows, { pretitle: AnimationModule.getKeyframeCode( light, "hard_shadows"), callback: function(v) { light.hard_shadows = v; }});
		inspector.widgets_per_row = 2;
		inspector.addNumber("Near", light.near, { pretitle: AnimationModule.getKeyframeCode( light, "near"), callback: function (value) { light.near = value;}});
		inspector.addNumber("Far", light.far, { pretitle: AnimationModule.getKeyframeCode( light, "far"), callback: function (value) { light.far = value; }});
		inspector.widgets_per_row = 1;
		inspector.addNumber("Shadow bias", light.shadow_bias, { pretitle: AnimationModule.getKeyframeCode( light, "shadow_bias"), step: 0.001, min:0, callback: function (value) { light.shadow_bias = value; }});
		inspector.addCombo("Shadowmap size", !light.shadowmap_resolution ? "Default" : light.shadowmap_resolution, { pretitle: AnimationModule.getKeyframeCode( light, "shadowmap_resolution"), values: ["Default",256,512,1024,2048,4096], callback: function(v) { 
			if(v == "Default")
				light.shadowmap_resolution = 0; 
			else
				light.shadowmap_resolution = parseFloat(v); 
		}});
	}

	inspector.addTitle("Textures");
	inspector.addTexture("Proj. texture", light.projective_texture, { pretitle: AnimationModule.getKeyframeCode( light, "projective_texture"), callback: function(filename) { 
		light.projective_texture = filename;
		LS.GlobalScene.refresh();
	}});

	inspector.addTexture("Extra texture", light.extra_texture, { pretitle: AnimationModule.getKeyframeCode( light, "extra_texture"), callback: function(filename) { 
		light.extra_texture = filename;
		LS.GlobalScene.refresh();
	}});

	inspector.addButton(null, "Edit Shader", { callback: function() { 
		CodingModule.openTab();
		CodingModule.editInstanceCode( light, { id: light.uid, title: "Light Shader", lang:"glsl", help: light.constructor.coding_help, getCode: function(){ return light.extra_light_shader_code; }, setCode: function(code){ light.extra_light_shader_code = code; } } );
	}});
}


LS.Components.CustomData["@inspector"] = function( component, inspector )
{
	//show properties
	for(var i = 0; i < component.properties.length; i++)
	{
		var p = component.properties[i];
		inspector.add( p.type, p.label || p.name, p.value, { pretitle: AnimationModule.getKeyframeCode( component, p.name ), title: p.name, step: p.step, property: p, callback: inner_on_property_value_change });
	}

	var valid_properties = ["number","vec2","vec3","vec4","color","texture","cubemap","node","string","sampler"];

	inspector.addButtons(null,["Add Property","Edit"], { callback: function(v) { 
		if(v == "Add Property")
			EditorModule.showAddPropertyDialog( inner_on_newproperty, valid_properties );
		else 
			EditorModule.showEditPropertiesDialog( component.properties, valid_properties, inner_on_editproperties );
	}});

	function inner_on_newproperty( p )
	{
		if (component[ p.name ])
		{
			LiteGUI.alert("There is already a property with that name.");
			return;
		}
		else
		{
			component.addProperty( p );
		}

		inspector.refresh();
	}

	function inner_on_editproperties( p )
	{
		//component.updateProperty( p );
		//TODO
		inspector.refresh();
	}	

	function inner_on_property_value_change(v)
	{
		var p = this.options.property;
		p.value = v;
		component.updateProperty( p );
		LS.GlobalScene.refresh();
	}
}

LS.Components.CameraFX["@inspector"] = function(camerafx, inspector)
{
	if(!camerafx)
		return;
	var node = camerafx._root;

	inspector.widgets_per_row = 2;
	inspector.addCheckbox("Viewport Size", camerafx.use_viewport_size, { name_width: "70%", pretitle: AnimationModule.getKeyframeCode( camerafx, "use_viewport_size" ), callback: function(v) { camerafx.use_viewport_size = v; } });
	inspector.addCheckbox("High Precission", camerafx.use_high_precision, { name_width: "70%", pretitle: AnimationModule.getKeyframeCode( camerafx, "use_high_precision" ), callback: function(v) { camerafx.use_high_precision = v; } });
	inspector.addCheckbox("Use node camera", camerafx.use_node_camera, { name_width: "70%", pretitle: AnimationModule.getKeyframeCode( camerafx, "use_node_camera" ), callback: function(v) { camerafx.use_node_camera = v; } });
	inspector.addCheckbox("Antialiasing", camerafx.use_antialiasing, { name_width: "70%", pretitle: AnimationModule.getKeyframeCode( camerafx, "use_antialiasing" ), callback: function(v) { camerafx.use_antialiasing = v; } });
	inspector.widgets_per_row = 1;

	inspector.addTitle("Active FX");

	var enabled_fx = camerafx.fx.fx;

	for(var i = 0; i < enabled_fx.length; i++)
	{
		var fx = enabled_fx[i];
		var fx_info = LS.TextureFX.available_fx[ fx.name ];
		if(!fx_info)
		{
			console.warn("Unknown FX: " + fx.name);
			continue;
		}
		if(fx_info.uniforms)
			for(var j in fx_info.uniforms)
			{
				var uniform = fx_info.uniforms[j];
				if(uniform.type == "float")
					inspector.addNumber( j, fx[j] !== undefined ? fx[j] : uniform.value, {
						min: uniform.min,
						max: uniform.max,
						step: uniform.step,
						fx_name: j,
						fx: fx,
						callback: function(v){
							this.options.fx[ this.options.fx_name ] = v;
						}				
					});
				else if(uniform.type == "color3")
					inspector.addColor( j, fx[j] !== undefined ? fx[j] : uniform.value, {
						fx_name: j,
						fx: fx,
						callback: function(v){
							this.options.fx[ this.options.fx_name ] = v;
						}				
					});
				else if(uniform.type == "sampler2D")
					inspector.addTexture( j, fx[j] !== undefined ? fx[j] : uniform.value, {
						fx_name: j,
						fx: fx,
						callback: function(v){
							this.options.fx[ this.options.fx_name ] = v;
						}				
					});
			}
	}

	inspector.addButton(null,"Edit FX", { callback: inner });
	//inspector.addButton(null,"Remove FX", {});

	var selected_enabled_fx = "";

	//show camera fx dialog
	function inner()
	{
		var dialog = LiteGUI.Dialog.getDialog("dialog_show_cameraFX");
		if(dialog)
			dialog.clear();
		else
			dialog = new LiteGUI.Dialog("dialog_show_cameraFX", { title:"CameraFX", close: true, width: 360, height: 270, scroll: false, draggable: true});

		dialog.show();

		var split = new LiteGUI.Split("load_scene_split",[50,50]);
		dialog.add(split);

		//left side
		var widgets_left = new LiteGUI.Inspector("camera_fx_list",{});
		widgets_left.addTitle("Available FX");
		split.getSection(0).add(widgets_left);
		var fx = LS.TextureFX.available_fx;
		var available_fx = [];
		for(var i in fx)
			available_fx.push(i);
		var selected_available_fx = "";
		var available_list = widgets_left.addList( null, available_fx, { height: 140, callback: function(v) {
			selected_available_fx = v;
		}});
		widgets_left.addButton(null,"Add FX", { callback: function(){
			camerafx.addFX( selected_available_fx );
			inspector.refresh();
			LS.GlobalScene.refresh();
			inner();
		}});

		var widgets_right = new LiteGUI.Inspector("camera_fx_enabled",{});
		widgets_right.addTitle("Current FX");
		var enabled_list = widgets_right.addList(null, enabled_fx, { selected: selected_enabled_fx, height: 140, callback: function(v) {
			selected_enabled_fx = v;
		}});
		split.getSection(1).add(widgets_right);
		widgets_right.addButtons(null,["Up","Down","Delete"], { callback: function(v){
			if(v == "Delete")
			{
				camerafx.removeFX( selected_enabled_fx );
			}
			else if(v == "Up")
			{
				camerafx.moveFX( selected_enabled_fx );
			}
			else if(v == "Down")
			{
				camerafx.moveFX( selected_enabled_fx, 1 );
			}
			inspector.refresh();
			LS.GlobalScene.refresh();
			inner();
		}});

		dialog.adjustSize();
	}
}

LS.Components.MorphDeformer["@inspector"] = function(component, inspector)
{
	if( component.morph_targets.length )
	{
		inspector.widgets_per_row = 3;
		for(var i in component.morph_targets)
		{
			var morph = component.morph_targets[i];
			inspector.addMesh("", morph.mesh, { pretitle: AnimationModule.getKeyframeCode( component, "morphs/"+i+"/mesh" ), name_width: 20, width: "60%", morph_index: i, callback: function(v) { 
				component.setMorphMesh( this.options.morph_index, v );
				LS.GlobalScene.refresh();
			}});

			inspector.addNumber("", morph.weight, { pretitle: AnimationModule.getKeyframeCode( component, "morphs/"+i+"/weight" ), name_width: 20, width: "25%", step: 0.01, morph_index: i, callback: function(v) { 
				component.setMorphWeight( this.options.morph_index, v );
				LS.GlobalScene.refresh();
			}});

			inspector.addButton(null, "<img src='imgs/mini-icon-trash.png'/>", { width: "15%", index: i, callback: function() { 
				component.morph_targets.splice( this.options.index, 1);
				inspector.refresh();
				LS.GlobalScene.refresh();
			}});
		}
		inspector.widgets_per_row = 1;
	}

	inspector.addButton(null,"Add Morph Target", { callback: function() { 
		component.morph_targets.push({ mesh:"", weight: 0.0 });
		inspector.refresh();
	}});
}

LS.Components.SkinDeformer.onShowProperties = LS.Components.SkinnedMeshRenderer.onShowProperties = function( component, inspector )
{
	inspector.addButton("","See bones", { callback: function() { 
		EditorModule.showBones( component.getMesh() );
	}});
}

EditorModule.showBones = function( mesh )
{
	if(!mesh && !mesh.bones)
	{
		LiteGUI.alert("This mesh doesn't have bones");
		return;
	}

	var dialog = new LiteGUI.Dialog("dialog_show_bones", {title:"Bones in Mesh", close: true, width: 360, height: 270, scroll: false, draggable: true});

	var widgets = new LiteGUI.Inspector("bones_widgets",{ });

	//get the names
	var selected = null;
	var bone_names = [];
	for(var i in mesh.bones)
		bone_names.push( mesh.bones[i][0] );
	var list = widgets.addList(null, bone_names, { height: 140, callback: function(v) {
		selected = v;
	}});

	widgets.addButton(null,"Select Bone", function(){
		if(!selected)
			return;
		var node = LS.GlobalScene.getNode(selected);
		if(!node)
			return;
		SelectionModule.setSelection( node );
	});

	dialog.add( widgets );
	dialog.adjustSize();
	dialog.show('fade');
}

LS.Components.ParticleEmissor["@inspector"] = function(component, inspector)
{
	if(!component) return;
	var node = component._root;

	inspector.addSlider("Max. Particles", component.max_particles, {step:10,min:10,max:1000, callback: function (value) { component.max_particles = value; }});
	inspector.addNumber("Warmup time", component.warm_up_time, {step:1,min:0,max:10, callback: function (value) { component.warm_up_time = value; }});
	inspector.addCheckbox("Point particles", component.point_particles,  {callback: function (value) { component.point_particles = value; }});

	inspector.addTitle("Emisor");
	inspector.addCombo("Type",component.emissor_type, { values: LS.Components.ParticleEmissor["@emissor_type"].values, callback: function (value) { 
		component.emissor_type = value; 
	}});
	inspector.addNumber("Rate",component.emissor_rate, {step:0.1,min:0,max:100, callback: function (value) { component.emissor_rate = value; }});
	inspector.addVector3("Size",component.emissor_size, {step:0.1,min:0, callback: function (value) { component.emissor_size = value; }});
	inspector.addMesh("Mesh", component.emissor_mesh, { callback: function(filename) { 
		component.emissor_mesh = filename;
		if(filename)
			LS.ResourcesManager.load(filename);
	}});
	inspector.addButton("Custom code", "Edit code", { callback: function() {
		CodingModule.editInstanceCode( component, { id: component.uid + ":Emit", title: "P.Emit", lang:"javascript", getCode: function(){ return component.custom_emissor_code; }, setCode: function(code){ component.custom_emissor_code = code; }},true);
	}});


	inspector.addTitle("Particles");
	inspector.addNumber("Life",component.particle_life, {step:0.1,min:0.01, callback: function (value) { component.particle_life = value; }});
	inspector.addNumber("Speed",component.particle_speed, {step:0.1,min:0, callback: function (value) { component.particle_speed = value; }});

	inspector.addNumber("Size",component.particle_size, {step:0.1,min:0, callback: function (value) { component.particle_size = value; }});
	inspector.addLine("Size Curve",component.particle_size_curve, {defaulty:0, width: 120, callback: function (value) { component.particle_size_curve = value; }});

	inspector.addTitle("Material");
	inspector.addCheckbox("Use node material", component.use_node_material, {callback: function (value) { component.use_node_material = value; }});
	inspector.addColor("Start Color", component.particle_start_color, { callback: function(color) { component.particle_start_color = color; } });
	inspector.addColor("End Color", component.particle_end_color, { callback: function(color) { component.particle_end_color = color; } });
	inspector.addSlider("Opacity",component.opacity, {step:0.001,min:0,max:1, callback: function (value) { component.opacity = value; }});
	inspector.addLine("Opacity Curve",component.particle_opacity_curve, {defaulty:0, width: 120, callback: function (value) { component.particle_opacity_curve = value; }});
	inspector.addNumber("Grid Texture",component.texture_grid_size, {step:1,min:1,max:5, callback: function (value) { component.texture_grid_size = value; }});
	inspector.addTexture("Texture", component.texture, { callback: function(filename) { 
		component.texture = filename;
		if(filename)
			LS.ResourcesManager.load(filename);
	}});

	inspector.widgets_per_row = 2;

	inspector.addCheckbox("Additive blending", component.additive_blending, {callback: function (value) { component.additive_blending = value; }});
	inspector.addCheckbox("Premultiply Alpha", component.premultiplied_alpha, {callback: function (value) { component.premultiplied_alpha = value; }});
	inspector.addCheckbox("Animated texture", component.animated_texture, {callback: function (value) { component.animated_texture = value; }});
	inspector.addCheckbox("Loop Animation", component.loop_animation, {callback: function (value) { component.loop_animation = value; }});
	inspector.addCheckbox("Independent color", component.independent_color, {callback: function (value) { component.independent_color = value; }});
	//inspector.addCheckbox("Soft particles", component.soft_particles, {callback: function (value) { component.soft_particles = value; }});
	inspector.widgets_per_row = 1;

	inspector.addButton("","Change flags", { callback: function() { 
		component._root.flags.depth_write = false;
		//component._root.flags.ignore_lights = true;
	}});

	inspector.addTitle("Physics");
	inspector.addVector3("Gravity",component.physics_gravity, {step:0.1, callback: function (value) { vec3.copy(component.physics_gravity, value); }});
	inspector.addNumber("Rotation",component.particle_rotation, {step:0.1, callback: function (value) { component.particle_rotation = value; }});
	inspector.addSlider("Friction",component.physics_friction, {step:0.001,min:0,max:1, callback: function (value) { component.physics_friction = value; }});
	inspector.addButton("Custom update", "Edit code", { callback: function() {
		CodingModule.editInstanceCode( component, { id: component.uid + ":Update", title: "P.Update", lang:"javascript", getCode: function(){ return component.custom_update_code; }, setCode: function(code){ component.custom_update_code = code;	}}, true);
	}});
	inspector.addTitle("Flags");

	inspector.widgets_per_row = 2;

	inspector.addCheckbox("Align camera", component.align_with_camera, {callback: function (value) { component.align_with_camera = value; }});
	inspector.addCheckbox("Align always", component.align_always, {callback: function (value) { component.align_always = value; }});
	inspector.addCheckbox("Follow emitter", component.follow_emitter, {callback: function (value) { component.follow_emitter = value; }});
	inspector.addCheckbox("Sort in Z", component.sort_in_z, {callback: function (value) { component.sort_in_z = value; }});
	inspector.addCheckbox("Stop", component.stop_update, {callback: function (value) { component.stop_update = value; }});

	inspector.widgets_per_row = 1;
}

/** extras ****/

LS.Components.PlayAnimation.onShowProperties = function(component, inspector)
{
	inspector.addButton("","Edit Animation", { callback: function() { 
		var anim = component.getAnimation();
		AnimationModule.showTimeline( anim );
	}});
}


LS.Components.CameraController.onShowProperties = function(component, inspector)
{
	if(!component._root || !component._root.camera)
		inspector.addInfo(null,"<span class='alert'>Warning: No camera found in node</span>");
}

