//Inspector Editors for the most common Components plus Materials and Scene.
//Editors are not included in LiteScene because they do not depend on them

EditorModule.showSceneInfo = function(scene, attributes)
{
}

EditorModule.registerNodeEditor( EditorModule.showSceneInfo );



GlobalInfo["@inspector"] = function(component, attributes)
{
	var node = component._root;
	if(!node)
		return;
	var scene = node._in_tree;
	if(!scene)
		return;

	attributes.addColor("Background", component.background_color, { pretitle: AnimationModule.getKeyframeCode( component, "background_color"), callback: function(color) { vec3.copy(component.background_color,color); } });
	attributes.addColor("Ambient light", component.ambient_color, { pretitle: AnimationModule.getKeyframeCode( component, "ambient_color"), callback: function(color) { vec3.copy(component.ambient_color,color); } });
	attributes.addSeparator();

	inner_setTexture("background");
	inner_setTexture("foreground");
	inner_setTexture("environment");
	inner_setTexture("irradiance");

	function inner_setTexture(channel)
	{
		attributes.addTexture(channel, component.textures[channel], { pretitle: AnimationModule.getKeyframeCode( component, "textures/" + channel ), channel: channel, callback: function(filename) { 
			component.textures[this.options.channel] = filename;
			if(filename && filename[0] != ":")
				LS.ResourcesManager.load( filename );
		}});
	}
}

// Some components need special inspectors
Transform["@inspector"] = function(transform, attributes)
{
	if(!transform) return;
	var node = transform._root;

	attributes.addVector3("Position", transform._position, { 
		pretitle: AnimationModule.getKeyframeCode( transform, "position"),
		callback: function(r) { 
			if(r.length == 3)
				transform.setPosition(r[0],r[1],r[2]);
		},callback_before: function() {
			EditorModule.saveComponentUndo(transform);
	}});

	var euler = quat.toEuler( vec3.create(), transform._rotation );
	vec3.scale(euler,euler, RAD2DEG );
	var rot = [euler[2],euler[0],euler[1]];

	attributes.addVector3("Rotation", rot, { 
		pretitle: AnimationModule.getKeyframeCode( transform, "rotation"),
		callback: function(r) {
			vec3.scale(r,r, DEG2RAD );
			var euler = [r[1],r[2],r[0]];
			transform.setRotationFromEuler(euler);
		}, callback_before: function() {
			EditorModule.saveComponentUndo(transform);
	}});

	var scale_widget = attributes.addVector3("Scale", transform._scaling, {
		step: 0.01,
		pretitle: AnimationModule.getKeyframeCode( transform, "scaling"),
		callback: function(v) {
			transform.setScale(v[0],v[1],v[2]);
		},
		callback_before: function() {
			EditorModule.saveComponentUndo(transform);
	}});

	attributes.addNumber("Uniform Scale", transform._scaling[0].toFixed(3), {
		step: 0.01,
		pretitle: AnimationModule.getKeyframeCode( transform, "scaling"),
		callback: function(v) {
			scale_widget.setValue([v,v,v]);
			//transform.setScale(v,v,v);
		}, callback_before: function() {
			EditorModule.saveComponentUndo(transform);
	}});
}


Camera["@inspector"] = function(camera, attributes)
{
	if(!camera) 
		return;
	var node = camera._root;

	attributes.addCombo("Type", camera.type, { values: { "Orthographic" : Camera.ORTHOGRAPHIC, "Perspective": Camera.PERSPECTIVE }, pretitle: AnimationModule.getKeyframeCode( camera, "type"), callback: function (value) { camera.type = value; } });
	attributes.widgets_per_row = 2;
	attributes.addNumber("Fov", camera.fov, { pretitle: AnimationModule.getKeyframeCode( camera, "fov"), min: 2, max: 180, units:'º', callback: function (value) { camera.fov = value; }});
	attributes.addNumber("Aspect", camera.aspect, { pretitle: AnimationModule.getKeyframeCode( camera, "aspect" ), min: 0.1, max: 10, step: 0.01, callback: function (value) { camera.aspect = value; }});
	attributes.addNumber("Near", camera.near, { pretitle: AnimationModule.getKeyframeCode( camera, "near" ), callback: function (value) { camera.near = value; }});
	attributes.addNumber("Far", camera.far, { pretitle: AnimationModule.getKeyframeCode( camera, "far" ), callback: function (value) { camera.far = value; }});
	attributes.widgets_per_row = 1;
	attributes.addNumber("Frustum size", camera.frustum_size, {  pretitle: AnimationModule.getKeyframeCode( camera, "frustum_size" ), callback: function (value) { camera.frustum_size = value; }});
	//attributes.addNumber("Far", camera.far, { callback: function (value) { camera.far = value; }});

	var is_node_camera = (node && !node._is_root);

	if(!is_node_camera)
	{
		attributes.addSeparator();
		attributes.addVector3("Eye", camera.eye, { pretitle: AnimationModule.getKeyframeCode( camera, "eye" ), disabled: is_node_camera, callback: function(v) { 
			camera.eye = v;
		}});
		attributes.addVector3("Center", camera.center, { pretitle: AnimationModule.getKeyframeCode( camera, "center" ), disabled: is_node_camera, callback: function(v) { 
			camera.center = v;
		}});
		attributes.addVector3("Up", camera.up, { pretitle: AnimationModule.getKeyframeCode( camera, "up" ),disabled: is_node_camera, callback: function(v) { 
			camera.up = vec3.normalize(vec3.create(), v);
		}});
	}

	attributes.addButton("","Copy from current",{disabled: is_node_camera, callback: inner_copy_from_current});

	attributes.addTitle("Viewport");
	attributes.addVector2("Offset", camera._viewport.subarray(0,2), { min:0, max:1, step: 0.001, callback: function(v) { 
		camera._viewport.subarray(0,2).set(v);
	}});
	attributes.addVector2("Size", camera._viewport.subarray(2,4), { min:0, max:1, step: 0.001, callback: function(v) { 
		camera._viewport.subarray(2,4).set(v);
	}});

	attributes.widgets_per_row = 2;
	attributes.addCheckbox("clear color", camera.clear_color , { callback: function (v) { camera.clear_color = v; } });
	attributes.addCheckbox("clear depth", camera.clear_depth , { callback: function (v) { camera.clear_depth = v; } });
	attributes.widgets_per_row = 1;

	attributes.addTitle("Render to Texture");
	attributes.addCheckbox("Enable", camera.render_to_texture , { callback: function (v) { camera.render_to_texture = v; } });
	attributes.addString("Name", camera.texture_name, { callback: function (v) { camera.texture_name = v; } });
	attributes.addVector2("Size", camera.texture_size, { callback: function(v) { camera.texture_size.set(v); }});
	attributes.widgets_per_row = 2;
	attributes.addCheckbox("High precission", camera.texture_high, { callback: function(v) { camera.texture_high = v; }});
	attributes.addCheckbox("Clone texture", camera.texture_clone, { callback: function(v) { camera.texture_clone = v; }});
	attributes.widgets_per_row = 1;

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

		EditorModule.refreshAttributes();
	}
}

CameraFX["@inspector"] = function(camerafx, attributes)
{
	if(!camerafx)
		return;
	var node = camerafx._root;

	attributes.addCheckbox("Viewport Size", camerafx.use_viewport_size, { callback: function(v) { camerafx.use_viewport_size = v; } });
	attributes.addCheckbox("High Precission", camerafx.use_high_precision, { callback: function(v) { camerafx.use_high_precision = v; } });

	attributes.addTitle("Active FX");
	for(var i = 0; i < camerafx.fx.length; i++)
	{
		var fx = camerafx.fx[i];
		var fx_info = CameraFX.available_fx[ fx.name ];
		if(fx_info.uniforms)
			for(var j in fx_info.uniforms)
			{
				var uniform = fx_info.uniforms[j];
				if(uniform.type == "float")
					attributes.addNumber( j, fx[j] !== undefined ? fx[j] : uniform.value, {
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
					attributes.addColor( j, fx[j] !== undefined ? fx[j] : uniform.value, {
						fx_name: j,
						fx: fx,
						callback: function(v){
							this.options.fx[ this.options.fx_name ] = v;
						}				
					});
			}
	}

	attributes.addButton(null,"Add FX", { callback: inner });
	//attributes.addButton(null,"Remove FX", {});

	//show camera fx dialog
	function inner()
	{
		var dialog = LiteGUI.Dialog.getDialog("dialog_show_cameraFX");
		if(dialog)
			dialog.clear();
		else
			dialog = new LiteGUI.Dialog("dialog_show_cameraFX", {title:"CameraFX", close: true, width: 360, height: 270, scroll: false, draggable: true});

		dialog.show();

		var split = new LiteGUI.Split("load_scene_split",[50,50]);
		dialog.add(split);

		//left side
		var widgets_left = new LiteGUI.Inspector("camera_fx_list",{});
		widgets_left.addTitle("Available FX");
		split.getSection(0).add(widgets_left);
		var fx = CameraFX.available_fx;
		var available_fx = [];
		for(var i in fx)
			available_fx.push(i);
		var selected_available_fx = "";
		var available_list = widgets_left.addList(null, available_fx, { height: 140, callback: function(v) {
			selected_available_fx = v;
		}});
		widgets_left.addButton(null,"Add FX", { callback: function(){
			camerafx.addFX(selected_available_fx);
			EditorModule.refreshAttributes();
			LS.GlobalScene.refresh();
			inner();
		}});

		var widgets_right = new LiteGUI.Inspector("camera_fx_enabled",{});
		var selected_enabled_fx = "";
		widgets_right.addTitle("Current FX");
		var enabled_list = widgets_right.addList(null, camerafx.fx, { height: 140, callback: function(v) {
			selected_enabled_fx = v;
		}});
		split.getSection(1).add(widgets_right);
		widgets_right.addButton(null,"Delete", { callback: function(){
			camerafx.removeFX( selected_enabled_fx );
			EditorModule.refreshAttributes();
			LS.GlobalScene.refresh();
			inner();
		}});

		dialog.adjustSize();
	}
}


Light["@inspector"] = function(light, attributes)
{
	if(!light) return;
	var node = light._root;

	var light_types = ["Omni","Spot","Directional"];
	attributes.addCombo("Type", light_types[light.type-1], { pretitle: AnimationModule.getKeyframeCode( light, "type"), values: light_types, callback: function(v) { 
		light.type = light_types.indexOf(v)+1; 
	}});

	attributes.addColor("Color", light.color, { pretitle: AnimationModule.getKeyframeCode( light, "color"), callback: function(color) { light.color = color; } });
	attributes.addSlider("Intensity", light.intensity, { pretitle: AnimationModule.getKeyframeCode( light, "intensity"), min:0, max:2, step:0.01, callback: function (value) { light.intensity = value; }});
	attributes.widgets_per_row = 2;
	attributes.addNumber("Angle", light.angle, { pretitle: AnimationModule.getKeyframeCode( light, "angle"), callback: function (value) { light.angle = value; }});
	attributes.addNumber("Angle End", light.angle_end, { pretitle: AnimationModule.getKeyframeCode( light, "angle_end"), callback: function (value) { light.angle_end = value; }});
	attributes.widgets_per_row = 1;
	attributes.addCheckbox("Spot cone", light.spot_cone != false, { pretitle: AnimationModule.getKeyframeCode( light, "spot_cone"), callback: function(v) { light.spot_cone = v; }});
	attributes.addNumber("Frustum size", light.frustum_size || 100, { pretitle: AnimationModule.getKeyframeCode( light, "frustum_size"), callback: function (value) { light.frustum_size = value; }});

	var is_root_camera = node._is_root;
	attributes.addSeparator();

	attributes.addVector3("Position", light.position, { pretitle: AnimationModule.getKeyframeCode( light, "position"), disabled: !is_root_camera, callback: function(v) { 
		light.position = v; 
	}});

	attributes.addVector3("Target", light.target, { pretitle: AnimationModule.getKeyframeCode( light, "target"), disabled: !is_root_camera, callback: function(v) { 
		light.target = v; 
	}});

	attributes.addSeparator();
	attributes.widgets_per_row = 2;
	attributes.addCheckbox("Linear att.", light.linear_attenuation != false, { pretitle: AnimationModule.getKeyframeCode( light, "linear_attenuation"), callback: function(v) { light.linear_attenuation = v; }});
	attributes.addCheckbox("Range att.", light.range_attenuation != false, { pretitle: AnimationModule.getKeyframeCode( light, "range_attenuation"), callback: function(v) { light.range_attenuation = v; }});
	attributes.addNumber("Att. start", light.att_start, { pretitle: AnimationModule.getKeyframeCode( light, "att_start"), callback: function (value) { light.att_start = value;}});
	attributes.addNumber("Att. end", light.att_end, { pretitle: AnimationModule.getKeyframeCode( light, "att_end"), callback: function (value) { light.att_end = value; }});
	attributes.widgets_per_row = 1;
	attributes.addSlider("Phong Offset", light.offset, { pretitle: AnimationModule.getKeyframeCode( light, "offset"), min: 0, step:0.01, max:1, callback: function (value) { light.offset = value; } });
	attributes.addSeparator();
	attributes.widgets_per_row = 2;
	attributes.addCheckbox("Const Diff.", !!light.constant_diffuse, { callback: function(v) { light.constant_diffuse = v; }});
	attributes.addCheckbox("Specular", light.use_specular != false, { callback: function(v) { light.use_specular = v; }});
	attributes.widgets_per_row = 1;
	attributes.addTitle("Shadow");
	attributes.widgets_per_row = 2;
	attributes.addCheckbox("Cast. shadows", light.cast_shadows, { pretitle: AnimationModule.getKeyframeCode( light, "cast_shadows"), callback: function(v) { light.cast_shadows = v; }});
	attributes.addCheckbox("Hard shadows", light.hard_shadows, { pretitle: AnimationModule.getKeyframeCode( light, "hard_shadows"), callback: function(v) { light.hard_shadows = v; }});
	attributes.addNumber("Near", light.near, { pretitle: AnimationModule.getKeyframeCode( light, "near"), callback: function (value) { light.near = value;}});
	attributes.addNumber("Far", light.far, { pretitle: AnimationModule.getKeyframeCode( light, "far"), callback: function (value) { light.far = value; }});
	attributes.widgets_per_row = 1;
	attributes.addNumber("Shadow bias", light.shadow_bias, { pretitle: AnimationModule.getKeyframeCode( light, "shadow_bias"), step: 0.001, min:0, callback: function (value) { light.shadow_bias = value; }});
	attributes.addCombo("Shadowmap size", light.shadowmap_resolution || 1024 , { pretitle: AnimationModule.getKeyframeCode( light, "shadowmap_resolution"), values: [0,256,512,1024,2048,4096], callback: function(v) { 
		if(v == 0)
			delete light["shadowmap_resolution"];
		else
			light.shadowmap_resolution = parseFloat(v); 
	}});

	attributes.addTexture("Proj. texture", light.projective_texture, { pretitle: AnimationModule.getKeyframeCode( light, "projective_texture"), callback: function(filename) { 
		light.projective_texture = filename;
		LS.GlobalScene.refresh();
	}});

	attributes.addButton(null, "Edit Shader", { callback: function() { 
		CodingModule.openTab();
		CodingModule.editInstanceCode( light, { id: light.uid, title: "Light Shader", lang:"glsl", help: light.constructor.coding_help, getCode: function(){ return light.extra_light_shader_code; }, setCode: function(code){ light.extra_light_shader_code = code; } } );
	}});
}


ParticleEmissor["@inspector"] = function(component, attributes)
{
	if(!component) return;
	var node = component._root;

	attributes.addSlider("Max. Particles", component.max_particles, {step:10,min:10,max:1000, callback: function (value) { component.max_particles = value; }});
	attributes.addNumber("Warmup time", component.warm_up_time, {step:1,min:0,max:10, callback: function (value) { component.warm_up_time = value; }});

	attributes.addTitle("Emisor");
	attributes.addCombo("Type",component.emissor_type, {values:{"Box":ParticleEmissor.BOX_EMISSOR,"Sphere":ParticleEmissor.SPHERE_EMISSOR, "Mesh":ParticleEmissor.MESH_EMISSOR }, callback: function (value) { 
		component.emissor_type = value; 
	}});
	attributes.addNumber("Rate",component.emissor_rate, {step:0.1,min:0,max:100, callback: function (value) { component.emissor_rate = value; }});
	attributes.addVector3("Size",component.emissor_size, {step:0.1,min:0, callback: function (value) { component.emissor_size = value; }});
	attributes.addMesh("Mesh", component.emissor_mesh, { callback: function(filename) { 
		component.emissor_mesh = filename;
		if(filename)
			ResourcesManager.loadMesh(filename);
	}});


	attributes.addTitle("Particles");
	attributes.addNumber("Life",component.particle_life, {step:0.1,min:0.01, callback: function (value) { component.particle_life = value; }});
	attributes.addNumber("Speed",component.particle_speed, {step:0.1,min:0, callback: function (value) { component.particle_speed = value; }});

	attributes.addNumber("Size",component.particle_size, {step:0.1,min:0, callback: function (value) { component.particle_size = value; }});
	attributes.addLine("Size Curve",component.particle_size_curve, {defaulty:0, width: 120, callback: function (value) { component.particle_size_curve = value; }});

	attributes.addTitle("Material");
	attributes.addCheckbox("Use node material", component.use_node_material, {callback: function (value) { component.use_node_material = value; }});
	attributes.addColor("Start Color", component.particle_start_color, { callback: function(color) { component.particle_start_color = color; } });
	attributes.addColor("End Color", component.particle_end_color, { callback: function(color) { component.particle_end_color = color; } });
	attributes.addSlider("Opacity",component.opacity, {step:0.001,min:0,max:1, callback: function (value) { component.opacity = value; }});
	attributes.addLine("Opacity Curve",component.particle_opacity_curve, {defaulty:0, width: 120, callback: function (value) { component.particle_opacity_curve = value; }});
	attributes.addSlider("Grid Texture",component.texture_grid_size, {step:1,min:1,max:5, callback: function (value) { component.texture_grid_size = value; }});
	attributes.addTexture("Texture", component.texture, { callback: function(filename) { 
		component.texture = filename;
		if(filename)
			ResourcesManager.load(filename);
	}});

	attributes.widgets_per_row = 2;

	attributes.addCheckbox("Additive blending", component.additive_blending, {callback: function (value) { component.additive_blending = value; }});
	attributes.addCheckbox("Premultiply Alpha", component.premultiplied_alpha, {callback: function (value) { component.premultiplied_alpha = value; }});
	attributes.addCheckbox("Animated texture", component.animated_texture, {callback: function (value) { component.animated_texture = value; }});
	attributes.addCheckbox("Loop Animation", component.loop_animation, {callback: function (value) { component.loop_animation = value; }});
	attributes.addCheckbox("Independent color", component.independent_color, {callback: function (value) { component.independent_color = value; }});
	//attributes.addCheckbox("Soft particles", component.soft_particles, {callback: function (value) { component.soft_particles = value; }});
	attributes.widgets_per_row = 1;

	attributes.addButton("","Change flags", { callback: function() { 
		component._root.flags.depth_write = false;
		component._root.flags.ignore_lights = true;
	}});

	attributes.addTitle("Physics");
	attributes.addVector3("Gravity",component.physics_gravity, {step:0.1, callback: function (value) { vec3.copy(component.physics_gravity, value); }});
	attributes.addNumber("Rotation",component.particle_rotation, {step:0.1, callback: function (value) { component.particle_rotation = value; }});
	attributes.addSlider("Friction",component.physics_friction, {step:0.001,min:0,max:1, callback: function (value) { component.physics_friction = value; }});

	attributes.addTitle("Flags");

	attributes.widgets_per_row = 2;

	attributes.addCheckbox("Align camera", component.align_with_camera, {callback: function (value) { component.align_with_camera = value; }});
	attributes.addCheckbox("Align always", component.align_always, {callback: function (value) { component.align_always = value; }});
	attributes.addCheckbox("Follow node", component.follow_emitter, {callback: function (value) { component.follow_emitter = value; }});
	attributes.addCheckbox("Sort in Z", component.sort_in_z, {callback: function (value) { component.sort_in_z = value; }});
	attributes.addCheckbox("Stop", component.stop_update, {callback: function (value) { component.stop_update = value; }});

	attributes.widgets_per_row = 1;
}


SkinnedMeshRenderer.onShowAttributes = function(component, attributes)
{
	attributes.addButton("","See bones", { callback: function() { 
		component.showBones();
	}});

	/*
	attributes.addButton("","Extract Skeleton", { callback: function() { 
		component.extractSkeleton();
	}});
	*/
}

SkinnedMeshRenderer.prototype.showBones = function(component, attributes)
{
	var dialog = new LiteGUI.Dialog("dialog_show_bones", {title:"Affecting bones", close: true, width: 360, height: 270, scroll: false, draggable: true});
	dialog.show('fade');

	var widgets = new LiteGUI.Inspector("bones_widgets",{ });

	var mesh = this.getMesh();
	if(mesh)
	{
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
			SelectionModule.setSelection(node);
		});
	}

	dialog.content.appendChild(widgets.root);	
}

/** for animations ****/

PlayAnimation.onShowAttributes = function(component, attributes)
{
	attributes.addButton("","Edit Animation", { callback: function() { 
		var anim = component.getAnimation();
		AnimationModule.showTimeline( anim );
	}});
}

