//this tool is always on, it changes the selected item when clicked
var selectTool = {
	name: "select",
	description: "Select a node",
	section: "select",
	icon: "imgs/mini-icon-cursor.png",
	keyShortcut: 81, //Q

	enabled: false,

	click_time: 200, //ms
	click_dist: 50, //in pixels (to avoid interpreting dragging as a fast click)
	click_pos: [0,0],
	last_click: 0,

	onRegister: function()
	{
		//RenderModule.canvas_manager.addWidget(this);
		ToolsModule.addBackgroundTool(this);
	},

	mousedown: function(e) {
		this.click_pos = [e.canvasx,e.canvasy];
		this._got_mousedown = true;
		var now = getTime();

		if( now - this.last_click < this.click_time && e.button == 0 )
		{
			//EditorModule.focusCameraInSelection();
			EditorModule.focusCameraInPixel( e );
		}
		this.last_click = now;
	},

	mousemove: function(e) {
	},

	mouseup: function(e) {
		//if(!this.enabled) return;

		e.preventDefault();
		e.stopPropagation();

		if(!this._got_mousedown)
			return; //somebody else captured the mousedown
		
		this._got_mousedown = false;

		if(e.button != 0)
			return;

		var now = getTime();
		var dist = Math.sqrt( (e.canvasx - this.click_pos[0])<<2 + (e.canvasy - this.click_pos[1])<<2 );

		//if it was a fast click and the mouse didnt move too much (dragging)
		if (e.click_time < this.click_time && dist < this.click_dist)
		{
			//Test if click was in GUI
			//TODO

			//PICKING in the Scene (this is slow, it requires to render the scene again)
			var instance_info = LS.Picking.getInstanceAtCanvasPosition( e.canvasx, e.canvasy, ToolUtils.getCamera(e) );
			if(!instance_info)
				return false;

			var r = false;
			if( instance_info.callback )
				r = instance_info.callback( instance_info, e );
			if(r)
				return false;

			if(e.shiftKey)
			{
				if( SelectionModule.isSelected( instance_info ) )
					SelectionModule.removeFromSelection( instance_info );
				else
					SelectionModule.addToSelection( instance_info );
			}
			else
				SelectionModule.setSelection( instance_info );
		}

		return false;
	}
};

ToolsModule.registerTool({ name: "select", display: false, module: selectTool });

