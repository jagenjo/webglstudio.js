/* This module includes a configurable postfx system */

var postfxEditor = {
	name: "PostFX",
	settings_panel: [ {name:"postfx", title:"PostFX", icon:null }],

	postfx: {},
	enabled_fx: null,
	default_rt_size: [2048,1024],//[1024,512],

	init: function()
	{
		LiteGUI.mainmenu.add("Actions/show PostFX", { callback: function() { postfxEditor.showPostFXEditor(); }});

		if(!gl) return;
		trace(" + init postfx");

		this.registerPostFX("Color correction", { shader:"colorFX", settings: [ 
			{ type:"slider", name: "Red", min: 0, max: 3, value: 1, variable: "u_red" },
			{ type:"slider", name: "Green", min: 0, max: 3, value: 1, variable: "u_green" },
			{ type:"slider", name: "Blue", min: 0, max: 3, value: 1, variable: "u_blue" },
			]});
		this.registerPostFX("Brightness/Contrast", { shader:"contrastFX", settings: [ 
			{ type:"slider", name: "Brightness", min: 0, max: 4, value: 1, variable: "u_brightness" },
			{ type:"slider", name: "Contrast", min: 0, max: 3, value: 0, variable: "u_contrast" },
			]});
		this.registerPostFX("Hue/Saturation", { shader:"hueFX", settings: [ 
			{ type:"slider", name: "Hue", min: 0, max: 1, value: 0, step:0.01, variable: "u_hue" },
			{ type:"slider", name: "Saturation", min: 0, max: 2, value: 1, step:0.01, variable: "u_saturation" },
			]});
		this.registerPostFX("Lens", {	shader:"lensFX" });
		this.registerPostFX("TV", {	shader:"tvFX" });
		this.registerPostFX("Glow", {	shader:"glowFX" });
		this.registerPostFX("DOF", {	shader:"DOFFX", depth: true, settings: [ 
			{ type:"number", name: "Focus distance", min: 0, value: 100, variable: "u_focus_distance" },
			{ type:"number", name: "Focus range", min: 0, value: 100, variable: "u_focus_range" },
			{ type:"slider", name: "Max. blur", min: 0, max: 5, value: 2, step: 0.1, variable: "u_max_blur" }
			]});
		this.registerPostFX("Edges", {	shader:"edgesFX" });
		this.registerPostFX("EdgesDepth", {	shader:"edgesDepthFX", depth: true, settings: [ 
			{ type:"slider", name: "Threshold", min: 0, max: 10, value: 1, variable: "u_threshold" },
			]});
		this.registerPostFX("Black & White", {	shader:"bwFX", settings: [ 
			{ type:"slider", name: "Threshold", min: -1, max: 1, value: 0, variable: "u_threshold" },
			]});
		this.registerPostFX("Retro C64", {	shader:"8bitsFX", rt_size: [128,256], minFilter: gl.NEAREST, magFilter: gl.NEAREST });
		this.registerPostFX("Instagram", {	shader:"instagramFX" });

		LEvent.bind(Scene,"clear", function() { 
			postfxEditor.enableFX(null);
		});

		//store and restore the postfx info
		LEvent.bind(Scene,"serializing", function(e,o) { 
			if(!o.extra) o.extra = {};
			if(postfxEditor.enabled_fx)
				o.extra.postfx = postfxEditor.enabled_fx; 
		});
		LEvent.bind(Scene,"configure", function(e,o) { 
			if(o.extra && o.extra.postfx) 
				postfxEditor.enableFX( o.extra.postfx.name, o.extra.postfx.settings ); 
		});

	},

	registerPostFX: function( name, fx )
	{
		fx.name = name;
		this.postfx[name] = fx;
	},

	showPostFXEditor: function()
	{
		var dialog = new LiteGUI.Dialog("dialog_postfx", {title:"Post FX", close: true, minimize: true, width: 400, height: 200, scroll: false, draggable: true});
		dialog.show('fade');

		var split = new LiteGUI.Split("postfx-split",[50,50]);
		dialog.content.appendChild(split.root);

		var selected_fx = null;

		var widgets = new LiteGUI.Inspector();
		widgets.addList(null, this.postfx, { height: 140, callback: inner_selected});
		widgets.widgets_per_row = 1;
		//widgets.addButton(null,"Enable", { callback: function() { postfxEditor.enableFX(selected); }});
		widgets.addButton(null,"Disable", { callback: function() { postfxEditor.enableFX(null); } });
		split.sections[0].appendChild(widgets.root);

		var setup_widgets = new LiteGUI.Inspector();
		split.sections[1].appendChild(setup_widgets.root);
		split.sections[1].style.overflow = "auto";

		function inner_selected(value)
		{
			selected = value;
			postfxEditor.enableFX(selected.name);
			setup_widgets.clear();

			if(selected && selected.settings)
			{
				//create settings panel
				for(var i in selected.settings)
				{
					//fx is the FX in the PostFX
					var fx = selected.settings[i];
					if(fx.uniforms)
						fx.value = fx.uniforms[ fx.variable ];
					if(fx.callback && fx.callback != inner_widget_change) fx._callback = fx.callback;
					fx.callback = inner_widget_change;
					setup_widgets.add(fx); //create widget
				}
			}
			else if(selected && selected.on_settings)
				selected.on_settings(setup_widgets);

			var uniforms = selected.uniforms || {};
			if(selected.fillUniforms)
				selected.fillUniforms(uniforms);
			var shader = Shaders.get(selected.shader);
			shader.uniforms( uniforms );
			RenderModule.requestFrame();
		}

		//when a value changes in a widget
		function inner_widget_change(value,name)
		{
			var shader = Shaders.get(selected.shader);
			if(!shader) return;

			var uniforms = selected.uniforms || {};
			postfxEditor.enabled_fx.settings[ this.options.name ] = value;
			if(this.options.variable)
				uniforms[ this.options.variable ] = value;
			if(this.options._callback)
				this.options._callback.call(selected,this);
			
			if(selected.fillUniforms)
				selected.fillUniforms(uniforms);
			shader.uniforms( uniforms );
			RenderModule.requestFrame();
		}
	},

	updateFXUniforms: function()
	{

	},

	enableFX: function(fxname, options)
	{
		options = options || {};

		//fx contains the FX as it is in the fx container
		var fx = null;
		if(fxname)
			fx = this.postfx[fxname];

		if(!fx)
		{
			postfxEditor.enabled_fx = null;
			RenderModule.render_options.texture = null;
			RenderModule.render_options.postfx_shader = null;
			if(fxname)
				LiteGUI.alert("PostFX not found: " + fxname);
			RenderModule.requestFrame();
			return;
		}

		var shader_name = fx.shader;

		//non configurable uniforms for the shader
		if(fx.uniforms)
			Shaders.get(shader_name).uniforms(fx.uniforms);

		this.enabled_fx = { name: fxname, settings: options };

		//this shader has settings
		if(fx.settings)
		{
			fx.uniforms = fx.uniforms || {};
			for(var i in fx.settings)
			{
				var setting = fx.settings[i];
				if( options[ setting.name ] != null ) //prioritize the value in the options
					fx.uniforms[ fx.settings[i].variable ] = options[ setting.name ];
				else
					fx.uniforms[ fx.settings[i].variable ] = fx.settings[i].value;
			}

			if(fx.fillUniforms)
				fx.fillUniforms(fx.uniforms);
			Shaders.get(shader_name).uniforms(fx.uniforms);
		}

		//create the RTexture with the appropiate size
		var rt_width = this.default_rt_size[0];
		var rt_height = this.default_rt_size[1];
		if(fx.rt_size)
		{
			rt_width = fx.rt_size[0];
			rt_height = fx.rt_size[1];
		}

		//if there is no rt or the old one doesnt have the appropiate size
		if(!this._rt || (rt_width != this._rt.width || rt_height != this._rt.height ))
		{
			this._rt = new Texture(rt_width, rt_height, {magFilter: fx.magFilter || gl.LINEAR, minFilter: fx.minFilter || gl.LINEAR_MIPMAP_LINEAR}); //{ minFilter: gl.NEAREST }
			if(Texture.isDepthSupported() )
				this._rt_depth = new Texture(rt_width, rt_height, {filter: gl.NEAREST, format: gl.DEPTH_COMPONENT, type: gl.UNSIGNED_SHORT  });
			ResourcesManager.textures[":scene_color"] = this._rt;
			if(this._rt_depth) ResourcesManager.textures[":scene_depth"] = this._rt_depth;
		}

		//configure the rendering pipeline
		RenderModule.render_options.texture = this._rt;
		if(this._rt_depth && fx.depth) RenderModule.render_options.depth_texture = this._rt_depth;
		else RenderModule.render_options.depth_texture = null;

		RenderModule.render_options.postfx_shader = shader_name;

		RenderModule.requestFrame();
	},
}

LiteGUI.registerModule( postfxEditor );


postfxEditor.registerPostFX("Curves", { shader:"curvesFX", settings: [ 
	{ type:"line", name: "Red", defaulty:0, width: 100, value: [[1,1]], variable: "u_red_curve" },
	{ type:"line", name: "Green", defaulty:0, width: 100, value: [[1,1]], variable: "u_green_curve" },
	{ type:"line", name: "Blue", defaulty:0, width: 100, value: [[1,1]], variable: "u_blue_curve" },
	{ type:"button", value: "Reset", callback: function() { 
		this.settings[0].value = [[1,1]];
		this.settings[1].value = [[1,1]];
		this.settings[2].value = [[1,1]];
	}},
	],
	fillUniforms: function(uniforms)
	{
		if(!this.texture)
		{
			this.texture = new Texture(1,16);
			this.buffer = createCanvas(16,1).getContext("2d").getImageData(0,0,16,1); // *sigh*
		}

		var samples_red = L3D.resampleCurve( this.settings[0].value,0,1,0,16 );
		var samples_green = L3D.resampleCurve( this.settings[1].value,0,1,0,16 );
		var samples_blue = L3D.resampleCurve( this.settings[2].value,0,1,0,16 );

		var buffer = this.buffer;
		for(var i = 0; i < samples_red.length; i++)
		{
			buffer.data[i*4] = samples_red[i] * 255;
			buffer.data[i*4+1] = samples_green[i] * 255;
			buffer.data[i*4+2] = samples_blue[i] * 255;
		}
		this.texture.uploadData(buffer);
		uniforms[ "u_curves" ] = this.texture.bind(2);
	}
});