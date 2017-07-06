var TextureTools = {
	init: function()
	{
		LiteGUI.menubar.add("Actions/Texture Tools", { callback: function() { 
			TextureTools.showToolsDialog();
		}});
	},

	showToolsDialog: function( texture_name )
	{
		if(this.dialog)
			this.dialog.close();

		var dialog = new LiteGUI.Dialog( { title:"Texture Tools", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);
		this.dialog = dialog;

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		widgets.onchange = function()
		{
			RenderModule.requestFrame();
		}

		inner_update();

		function inner_update()
		{
			var texture = null;
			if( texture_name )
				texture = LS.ResourcesManager.getMesh( texture_name );

			widgets.clear();

			widgets.addTexture("Texture", texture_name || "", { callback: function(v) {
				texture_name = v;
				inner_update();
			}, callback_load: function( res ){
				texture_name = res.filename;
				inner_update();
			}});

			if(texture)
			{
				texture.inspect( widgets, true );
			}
			else
			{
				if(LS.ResourcesManager.isLoading( texture ))
					widgets.addInfo(null, "Loading...");
			}

			widgets.addSeparator();
			widgets.addButton("", "Close" , { callback: function (value) { 
				dialog.close(); 
			}});
			dialog.adjustSize();

		}//inner update

		dialog.add( widgets );
		dialog.adjustSize();		
	},

	showApplyShaderDialog: function( texture )
	{
		if(!texture)
			return;

		var filename = "";
		if(texture)
			filename = texture.fullpath || texture.filename;

		var dialog = new LiteGUI.Dialog( { title:"Apply Shader", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		widgets.addTexture("Texture", filename, { callback: function(v){
			filename = v;
			//reload?
		}});

		var code = "color.xyz = vec3(1.0) - color.xyz";
		widgets.addTitle("Code");
		widgets.addInfo(null,"vec4 color and vec2 uv");
		widgets.addTextarea(null,code,{ height: 100, callback: function(v){
			code = v;
		},callback_keydown: function(e){
			if(e.keyCode == 13 && e.ctrlKey)
			{
				code = e.target.value;
				inner_apply();
				e.preventDefault();
				e.stopPropagation();
			}
		}});

		var error_widget = widgets.addInfo(null," ");

		widgets.addButton(null,"Apply FX", inner_apply );
		widgets.addButton(null,"Restore Original", inner_restore );

		dialog.show();
		dialog.adjustSize();		

		var clone = null;
		var backup = null;
		var shader = null;

		function inner_apply()
		{
			try
			{
				shader = GL.Shader.createFX( code, null, shader );
			}
			catch (err)
			{
				console.error(err);
				error_widget.setValue("Error: " + err );
				return;
			}
			if(!clone)
			{
				clone = texture.clone();
				backup = texture.clone();
			}
			else
				texture.copyTo( clone );
			clone.copyTo( texture, shader );
			LS.RM.resourceModified( texture );
			RenderModule.requestFrame();
		}

		function inner_restore()
		{
			if(!backup)
				return;
			backup.copyTo( texture );
			RenderModule.requestFrame();
		}
	},

	exportToFile: function( texture )
	{
		if(!texture)
			return;
		var file = texture.toBlob();
		LiteGUI.downloadFile("export.png", file );
	},

	showResizeDialog: function( texture, on_complete )
	{
		var dialog = new LiteGUI.Dialog( { title:"Resize Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		widgets.widgets_per_row = 2;
		var width = texture.width;
		var height = texture.height;

		var width_widget = widgets.addNumber("Width", texture.width, { width: "75%", callback: function(v){
			width = v;
		}});
		widgets.addButton(null, "Nearest POT", { width: "25%", callback: function(){
			width = GL.Texture.nextPOT( width_widget.getValue() );
			width_widget.setValue( width );
		}});

		var height_widget = widgets.addNumber("Height", texture.height, { width: "75%", callback: function(v){
			height = v;
		}});
		widgets.addButton(null, "Nearest POT", { width: "25%", callback: function(){
			height = GL.Texture.nextPOT( height_widget.getValue() );
			height_widget.setValue( height );
		}});

		widgets.widgets_per_row = 1;

		widgets.addButton(null,"Resize", inner_apply );

		dialog.show();
		dialog.adjustSize();		

		function inner_apply()
		{
			var info = texture.getProperties();
			info.wrap = GL.REPEAT;
			info.minFilter = GL.LINEAR_MIPMAP_LINEAR;
			if(width == texture.width && height == texture.height)
				return;
			var resized_texture = new GL.Texture( width, height, info );
			texture.copyTo( resized_texture );
			LS.RM.registerResource( texture.filename, resized_texture );

			if(on_complete)
				on_complete(resized_texture);
		}
	},

	showBlurDialog: function( texture )
	{
		var dialog = new LiteGUI.Dialog( { title:"Blur Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		var iterations = 1;
		var size = 1;
		var temp = null;

		widgets.addNumber("Iterations", iterations, { min:1, step:1, precision:0, callback: function(v){
			iterations = v;
		}});

		widgets.addSlider("Size", size, { min:0, max:2, callback: function(v){
			size = v;
		}});

		widgets.addButton(null, "Apply Blur", { callback: function(){
			for(var i = 0; i < iterations; ++i)
				temp = texture.applyBlur(size,size,1,temp);
			RenderModule.requestFrame();
		}});

		dialog.show();
		dialog.adjustSize();		
	},

	showFillDialog: function( texture )
	{
		var dialog = new LiteGUI.Dialog( { title:"Fill Texture", close: true, minimize: true, width: 300, height: 440, scroll: false, draggable: true});
		dialog.show();
		dialog.setPosition(100,100);

		var widgets = new LiteGUI.Inspector( { name_width: "50%" } );
		dialog.add( widgets );

		var color = vec4.fromValues(1,1,1,1);

		widgets.addColor("Color", color, { callback: function(v){
			color.set( v );
		}});

		widgets.addSlider("Alpha", color[3], { min:0, max:1, callback: function(v){
			color[3] = v;
		}});

		widgets.addButton(null, "Fill", { callback: function(){
			texture.fill(color);
			RenderModule.requestFrame();
		}});

		dialog.show();
		dialog.adjustSize();		
	}

};

GL.Texture.prototype.inspect = function( widgets, skip_default_widgets )
{
	var texture = this;
	var formats = { 6407: "gl.RGB", 6408: "gl.RGBA", };
	var texture_types = { 3553: "gl.TEXTURE_2D", 34067: "gl.TEXTURE_CUBE_MAP" };
	var types = { 5121: "gl.UNSIGNED_BYTE", 36193: "gl.HALF_FLOAT_OES", 5126: "gl.FLOAT" };

	widgets.addString("Filename", texture.filename || "" );
	widgets.addString("Width", texture.width );
	widgets.addString("Height", texture.height );
	widgets.addString("Format", formats[ texture.format ] || "unknown" );
	widgets.addString("Type", types[ texture.type ] || "unknown" );
	widgets.addString("Texture type", texture_types[ texture.texture_type ] || "unknown" );

	widgets.addTitle("Actions");

	widgets.widgets_per_row = 2;
	
	widgets.addButton(null, "Blur", function(){
		TextureTools.showBlurDialog( texture );
	});

	widgets.addButton(null, "Apply shader", function(){
		TextureTools.showApplyShaderDialog( texture );
	});
	widgets.addButton(null, "Fill", function(){
		TextureTools.showFillDialog( texture );
	});
	widgets.addButton(null, "Resize", function(){
		TextureTools.showResizeDialog( texture );
	});

	widgets.widgets_per_row = 1;

	if(!skip_default_widgets)
		DriveModule.addResourceInspectorFields( this, widgets );
}

CORE.registerModule( TextureTools );